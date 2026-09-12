import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T032b / FR-031b, SC-015, US8 — **the deletion screen: all three outcomes named, and the
 * person's own `@handle` typed before it proceeds** (CLR-010).
 *
 * ── What the requirement actually buys, and why each half needs its own assertions ──────────
 *
 * CLR-003 decided that a deleted maker's published work **stays**, credited to a tombstone. That
 * is the surprising half: someone pressing EXCLUIR in the belief their projects disappear has
 * been misled by the screen's silence, and the erasure is irreversible, so there is no second
 * chance to correct the impression. § 2 therefore asserts the copy names **all three** outcomes
 * — the personal data goes, the work stays, the likes go and the counters are recomputed — one
 * assertion each, because a screen that names two of the three is exactly the failure CLR-010
 * exists to prevent and a single "mentions deletion" check cannot see it.
 *
 * The second half is friction: typing one's own `@handle`. § 4 drives the **action**, not the
 * markup, because `required` on an input is a browser convenience and a server action is
 * reachable without a browser at all — a confirmation enforced only by an attribute is a
 * confirmation an accidental or forged POST walks straight past.
 *
 * ── Why the identity is re-read from the session inside the action (§ 5) ────────────────────
 *
 * Every value in a `FormData` is the sender's to write. If the action compared the typed handle
 * against a handle carried by the form, or deleted whatever `perfilId` the form named, the gate
 * would be self-certifying: submit `handle=x` with `confirmacao=x` and the screen proceeds — for
 * somebody else's profile. So the assertions demand that the profile comes from the session,
 * that it is looked up **by the signed-in account**, and that hostile form fields change nothing.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * Feature 001's CLR-003 keeps the stack at Vitest with no DOM — the same reason `login-page`'s
 * suite walks the returned tree rather than painting it. A server component is a plain async
 * function returning a plain object, so awaiting it asserts the markup it actually builds. The
 * data seams (`lib/tenancy`, `lib/tenancy/session`, `lib/accounts/deletion`) are mocked because
 * the claim under test is *what the screen does with the answers*, not that Payload erases rows
 * — `deletion.ts` has its own suite for that. § 7 pins the page to those seams by reading its
 * source, so a mock cannot make this suite pass over a page that invented its own data path.
 */

const PERFIL = { id: 42, handle: 'mariasilva', nome: 'Maria Silva' }

/** Someone else's profile, used to prove the gate is about *this* person's handle. */
const OUTRO = { id: 99, handle: 'joaodavila' }

const mocks = vi.hoisted(() => ({
  /** What the real `redirect()` does: it throws, and never returns. A mock that returned would
   *  let execution fall through to code the runtime never reaches. */
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  headers: vi.fn(async () => new Headers({ host: 'cite.fablab.test' })),
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => ({ id: 7 })),
  signOut: vi.fn(async (): Promise<void> => {}),
  find: vi.fn<(args: unknown) => Promise<{ docs: unknown[]; totalDocs: number }>>(async () => ({
    docs: [PERFIL],
    totalDocs: 1,
  })),
  // Echoes the ids it was opened with, so the case below can prove the store handed to
  // `deleteAccount` is THIS session's door and not some other one.
  getErasureScopedPayload: vi.fn<(input: unknown) => Promise<unknown>>(async (input) => ({
    tenantId: 'org-fake',
    perfilId: (input as { perfilId?: unknown }).perfilId,
    usuarioId: (input as { usuarioId?: unknown }).usuarioId,
  })),
  // Two parameters, because the second IS the claim: `deps.getStore` is the seam the erasure
  // door is supplied through, and a mock typed with one argument makes `calls[0][1]` unreadable.
  deleteAccount: vi.fn<(input: unknown, deps?: unknown) => Promise<unknown>>(async () => ({
    curtidasRemovidas: 3,
    conteudosAnonimizados: 2,
    perfisRestantes: 0,
    contaRemovida: true,
    jaRemovido: false,
  })),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('../../lib/tenancy/session', () => ({
  currentUser: mocks.currentUser,
  signOut: mocks.signOut,
}))
vi.mock('../../lib/tenancy', () => ({
  getTenantScopedPayloadForRSC: async () => ({ find: mocks.find }),
  // The erasure door. Mocked rather than driven because this file is about the SCREEN — the
  // confirmation gate, the session lookup, the order of erase-then-sign-out. What the door
  // itself refuses is `tests/tenancy/erasure-door.test.ts`, against a real database, because a
  // proof of ownership asserted against a mock proves only that the mock agrees.
  getErasureScopedPayload: mocks.getErasureScopedPayload,
}))
vi.mock('../../lib/accounts/deletion', () => ({ deleteAccount: mocks.deleteAccount }))

const pagina = await import('../../app/(frontend)/minha-conta/excluir/page.js')
const {
  default: Page,
  excluirConta,
  confirmacaoConfere,
  CAMPO_CONFIRMACAO,
  EXCLUIR_PATH,
  DESTINO_APOS_EXCLUSAO,
  MENSAGEM_CONFIRMACAO_INVALIDA,
} = pagina as {
  default: (props?: unknown) => Promise<ReactNode>
  excluirConta: (dados: FormData) => Promise<void>
  confirmacaoConfere: (digitado: string, handle: string) => boolean
  CAMPO_CONFIRMACAO: string
  EXCLUIR_PATH: string
  DESTINO_APOS_EXCLUSAO: string
  MENSAGEM_CONFIRMACAO_INVALIDA: string
}

const PAGE_SOURCE = readFileSync(
  join(
    import.meta.dirname,
    '..',
    '..',
    'app',
    '(frontend)',
    'minha-conta',
    'excluir',
    'page.tsx',
  ),
  'utf8',
)

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose tag matches, depth first. */
function findAll(node: ReactNode, tag: string): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, tag))
  if (!isElement(node)) return []
  const here = node.type === tag ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, tag)]
}

/** Every string the tree would print, joined — the visitor-visible copy. A `<style>` block is
 *  CSS, not copy: folding it in would let a class name satisfy an assertion about a message. */
function texto(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

const renderizar = async (query: Record<string, string> = {}): Promise<ReactNode> =>
  (await Page({ searchParams: Promise.resolve(query) })) as ReactNode

const copia = async (query: Record<string, string> = {}): Promise<string> =>
  texto(await renderizar(query))

/** Drives something that must redirect, and returns where to. */
async function redirecionaPara(acao: () => Promise<unknown>): Promise<string> {
  await expect(acao()).rejects.toThrow(/NEXT_REDIRECT/)
  expect(mocks.redirect, 'the page redirected more than once').toHaveBeenCalledTimes(1)
  return mocks.redirect.mock.calls[0]?.[0] as string
}

const formulario = (confirmacao: string, extras: Record<string, string> = {}): FormData => {
  const dados = new FormData()
  dados.set(CAMPO_CONFIRMACAO, confirmacao)
  for (const [chave, valor] of Object.entries(extras)) dados.set(chave, valor)
  return dados
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue({ id: 7 })
  mocks.headers.mockResolvedValue(new Headers({ host: 'cite.fablab.test' }))
  mocks.find.mockResolvedValue({ docs: [PERFIL], totalDocs: 1 })
  mocks.deleteAccount.mockResolvedValue({
    curtidasRemovidas: 3,
    conteudosAnonimizados: 2,
    perfisRestantes: 0,
    contaRemovida: true,
    jaRemovido: false,
  })
})

describe('§1 — the route is a real screen, not a placeholder', () => {
  it('no longer renders feature 001’s stub', () => {
    expect(
      /\bPageStub\b|page-stub/.test(PAGE_SOURCE),
      'the deletion route still renders the placeholder. CLR-010 gives this screen two jobs — ' +
        'naming the three outcomes and demanding the handle — and a stub does neither.',
    ).toBe(false)
  })

  it('renders one form whose submit is a server action', async () => {
    const forms = findAll(await renderizar(), 'form')
    expect(forms, 'the page renders no <form>, so nothing can be confirmed').toHaveLength(1)
    expect(
      typeof forms[0]?.props.action,
      'the form’s action is not the page’s own action; a hand-written URL here would post an ' +
        'irreversible erasure to a path nothing in this suite watches.',
    ).toBe('function')
  })
})

describe('§2 — all three outcomes are named before the person presses anything (FR-031b)', () => {
  it('says the personal data is erased', async () => {
    expect(
      await copia(),
      'the screen never says the personal data is erased, which is the outcome the person ' +
        'came for and the one LGPD is about.',
    ).toMatch(/dados pessoais/i)
  })

  it('says the published work stays, credited to a tombstone', async () => {
    const texto_ = await copia()

    expect(
      texto_,
      'the screen never says the published work STAYS. CLR-003 keeps artigos, aulas and ' +
        'modelos so a departure cannot silently remove the lab’s teaching material — and ' +
        'CLR-010 exists because someone deleting in the belief their projects vanish has been ' +
        'misled by exactly this silence. It is the one outcome nobody expects.',
    ).toMatch(/permanec|continua|mantid|segue/i)
    expect(
      texto_,
      'the work is said to stay, but not that the byline goes with the person — the card ' +
        'renders a tombstone (“autor removido”), and a reader who is not told expects to keep ' +
        'their name on it.',
    ).toMatch(/autor/i)
  })

  it('says the likes are removed and the counters recomputed', async () => {
    expect(
      await copia(),
      'the screen never mentions the curtidas. They are deleted and every counter they fed is ' +
        'recomputed (deletion.ts), which is a visible change to other people’s pages.',
    ).toMatch(/curtida/i)
  })

  it('says the erasure cannot be undone', async () => {
    expect(
      await copia(),
      'nothing on the screen says the act is irreversible, which is the premise the typed ' +
        'handle is friction FOR.',
    ).toMatch(/não pode ser desfeit|irreversí|permanentement|definitiv/i)
  })
})

describe('§3 — the screen shows the handle it is about to demand (CLR-010)', () => {
  it('prints the person’s own @handle', async () => {
    expect(
      await copia(),
      'the screen asks for a handle it never shows. The handle is DERIVED from the name at ' +
        'signup (CLR-002) and typed nowhere else, so a person who has never seen theirs cannot ' +
        'produce it — the gate becomes a dead end rather than friction.',
    ).toContain(`@${PERFIL.handle}`)
  })

  it('offers one text field for the confirmation, and marks it required', async () => {
    const campos = findAll(await renderizar(), 'input').filter(
      (input) => input.props.type !== 'hidden',
    )

    const confirmacao = campos.find((input) => input.props.name === CAMPO_CONFIRMACAO)
    expect(
      confirmacao,
      `the form has no field named ${JSON.stringify(CAMPO_CONFIRMACAO)}; the fields it does ` +
        `offer are ${JSON.stringify(campos.map((input) => input.props.name))}.`,
    ).toBeDefined()
    expect(confirmacao?.props.required, 'the confirmation field is optional').toBe(true)
  })

  it('never carries the expected handle in a hidden field the sender could rewrite', async () => {
    const ocultos = findAll(await renderizar(), 'input').filter(
      (input) => input.props.type === 'hidden',
    )

    expect(
      ocultos.map((input) => String(input.props.value ?? '')),
      'the expected handle (or the profile id) travels in a hidden field. Everything in a ' +
        'FormData is the sender’s to rewrite, so a gate comparing the typed value against a ' +
        'submitted one certifies itself — see §5.',
    ).not.toContain(PERFIL.handle)
    expect(ocultos.map((input) => String(input.props.value ?? ''))).not.toContain(
      String(PERFIL.id),
    )
  })

  it('offers a way out that is not the erasure', async () => {
    const saidas = findAll(await renderizar(), 'a').map((link) => String(link.props.href ?? ''))

    expect(
      saidas.some((href) => href.startsWith('/minha-conta') && href !== EXCLUIR_PATH),
      `the screen has no link back; a person who opened it to read the consequences and ` +
        `decided against it is left with the erasure as the only control. Links found: ` +
        `${JSON.stringify(saidas)}`,
    ).toBe(true)
  })
})

describe('§4 — nothing proceeds until the person’s own handle is typed (CLR-010)', () => {
  const RECUSAS: Record<string, string> = {
    'an empty confirmation': '',
    'whitespace only': '   ',
    'a near miss': 'mariasilv',
    'the display name instead of the handle': 'Maria Silva',
    'somebody else’s handle': OUTRO.handle,
    'the literal word': 'EXCLUIR',
    'the at sign alone': '@',
  }

  for (const [nome, digitado] of Object.entries(RECUSAS)) {
    it(`refuses ${nome} and erases nothing`, async () => {
      const destino = await redirecionaPara(() => excluirConta(formulario(digitado)))

      expect(
        mocks.deleteAccount,
        `the screen accepted ${JSON.stringify(digitado)} as a confirmation and erased the ` +
          'account. The typed handle is the only thing standing between a stray press and an ' +
          'irreversible erasure (CLR-010).',
      ).not.toHaveBeenCalled()
      expect(
        destino.startsWith(EXCLUIR_PATH),
        `a refused confirmation sent the person to ${destino} instead of back to the screen.`,
      ).toBe(true)
    })
  }

  it('tells the person why the confirmation was refused', async () => {
    const destino = await redirecionaPara(() => excluirConta(formulario('mariasilv')))
    vi.clearAllMocks()

    const query = Object.fromEntries(new URL(destino, 'https://cite.fablab.test').searchParams)

    expect(
      await copia(query),
      'the refused confirmation renders no message at all, so the screen looks identical to ' +
        'the one the person just submitted and nothing tells them what to change.',
    ).toContain(MENSAGEM_CONFIRMACAO_INVALIDA)
  })

  it('shows no error on a first visit — the message is the answer to an attempt', async () => {
    expect(await copia()).not.toContain(MENSAGEM_CONFIRMACAO_INVALIDA)
  })

  it('accepts the handle as the screen prints it, and as a person would retype it', async () => {
    const aceitos = [PERFIL.handle, `@${PERFIL.handle}`, `  @${PERFIL.handle}  `, 'MariaSilva']

    for (const digitado of aceitos) {
      vi.clearAllMocks()
      await redirecionaPara(() => excluirConta(formulario(digitado)))

      expect(
        mocks.deleteAccount,
        `the screen refused ${JSON.stringify(digitado)}, which is the person’s own handle — ` +
          'the copy prints it with the leading @, so refusing the @ (or the capitals of the ' +
          'name it was folded from) rejects the most likely honest spelling.',
      ).toHaveBeenCalledTimes(1)
    }
  })

  it('exposes the comparison as a pure function, so the rule is testable without a request', () => {
    expect(confirmacaoConfere('mariasilva', 'mariasilva')).toBe(true)
    expect(confirmacaoConfere('@mariasilva', 'mariasilva')).toBe(true)
    expect(confirmacaoConfere('joaodavila', 'mariasilva')).toBe(false)
    expect(
      confirmacaoConfere('', ''),
      'an empty typed value matched an empty stored handle. A profile whose handle failed to ' +
        'derive would then be deletable by pressing the button with the field untouched — ' +
        'which is the accidental confirmation the gate exists to make impossible.',
    ).toBe(false)
    expect(
      confirmacaoConfere('@', ''),
      'the bare at sign matched an empty handle: the same hole, spelled differently.',
    ).toBe(false)
  })
})

describe('§5 — the identity is the session’s, never the form’s (FR-031b)', () => {

  /**
   * The defect this case exists for: the action fabricated `{ headers } as never` as its
   * request. With no `user` on it, `scopedAccess()` denied the very first read and nothing was
   * ever erased — and the `as never` cast was the only reason it compiled. A real session would
   * not have been enough either: `perfilMaker.delete` is `teamOnly()` and `users.delete` is
   * `masterOnly()`, so the erasure needs a door, and the door needs to be told who is asking.
   */
  it('opens the erasure door with the SESSION’s account, not a fabricated request', async () => {
    await expect(excluirConta(formulario(PERFIL.handle))).rejects.toThrow(/NEXT_REDIRECT/)

    expect(
      mocks.getErasureScopedPayload,
      'the action never opened the erasure door. Without it the delete is refused by ' +
        '`teamOnly()`/`masterOnly()`, and the person is told their account is gone.',
    ).toHaveBeenCalledTimes(1)

    const entrada = mocks.getErasureScopedPayload.mock.calls[0]?.[0] as {
      usuarioId?: unknown
      perfilId?: unknown
      host?: unknown
    }
    // Both ids come from the session lookup, never from the submitted form — which is what the
    // door then PROVES belong together before it unseals anything.
    expect(entrada?.usuarioId).toBe(7)
    expect(entrada?.perfilId).toBe(PERFIL.id)
    expect(entrada?.host, 'the door was opened with no host, so it resolves no tenant').toBeTruthy()

    // Opened is not used. The first version of this case asserted only the call above and stayed
    // green when the door was built and then thrown away — `deleteAccount` fell back to its
    // default `getTenantScopedPayload`, which is refused by `teamOnly()`/`masterOnly()` at the
    // delete. The claim is that the erasure RUNS ON the door.
    const deps = mocks.deleteAccount.mock.calls[0]?.[1] as { getStore?: unknown } | undefined
    expect(
      typeof deps?.getStore,
      'the erasure was handed no store, so it falls back to the request-scoped client — which ' +
        'cannot delete a `perfilMaker` (teamOnly) or a `users` row (masterOnly). The screen ' +
        'reports success and the account stays.',
    ).toBe('function')

    const store = await (deps?.getStore as () => Promise<{ perfilId: unknown }>)()
    expect(store.perfilId, 'the store handed over is not the door this session opened').toBe(
      PERFIL.id,
    )
  })
  it('looks the profile up by the signed-in account', async () => {
    await redirecionaPara(() => excluirConta(formulario(PERFIL.handle)))

    const [args] = mocks.find.mock.calls.at(-1) ?? []
    expect(args, 'the action never read a profile at all').toBeDefined()
    expect(
      JSON.stringify(args),
      'the profile lookup is not filtered by the signed-in account. Scoped to the lab alone it ' +
        'returns whichever profile happens to come first, and the screen would erase a ' +
        'stranger’s account: the query issued was ' + JSON.stringify(args),
    ).toMatch(/usuario/)
    expect(JSON.stringify(args)).toMatch(/perfilMaker/)
  })

  it('erases the session’s profile, whatever the form claims', async () => {
    await redirecionaPara(() =>
      excluirConta(formulario(PERFIL.handle, { perfilId: String(OUTRO.id), handle: OUTRO.handle })),
    )

    const [input] = mocks.deleteAccount.mock.calls[0] ?? []
    expect(
      (input as { perfilId?: unknown } | undefined)?.perfilId,
      'the action deleted the profile the FORM named. A hostile submit then erases anyone in ' +
        'the lab whose id the sender can guess.',
    ).toBe(PERFIL.id)
  })

  it('refuses another profile’s handle even when the form claims that profile', async () => {
    await redirecionaPara(() =>
      excluirConta(formulario(OUTRO.handle, { handle: OUTRO.handle, perfilId: String(OUTRO.id) })),
    )

    expect(
      mocks.deleteAccount,
      'the confirmation was compared against a handle the SENDER supplied, so submitting the ' +
        'same string in both fields passes the gate. The comparison must be against the handle ' +
        'read from the session’s profile.',
    ).not.toHaveBeenCalled()
  })

  it('sends the deletion a request, so it runs on this request’s transaction', async () => {
    await redirecionaPara(() => excluirConta(formulario(PERFIL.handle)))

    const [input] = mocks.deleteAccount.mock.calls[0] ?? []
    expect(
      (input as { req?: unknown } | undefined)?.req,
      'deleteAccount was called without a `req`; it resolves the choke-point client from it, ' +
        'and every write it makes has to share the caller’s transaction (deletion.ts).',
    ).toBeDefined()
  })
})

describe('§6 — a visitor with no session sees no deletion screen (US8)', () => {
  it('sends a signed-out visitor to login rather than rendering the form', async () => {
    mocks.currentUser.mockResolvedValue(null)

    expect(await redirecionaPara(() => renderizar())).toMatch(/^\/login/)
  })

  it('refuses a submit with no session, and erases nothing', async () => {
    mocks.currentUser.mockResolvedValue(null)

    await expect(excluirConta(formulario(PERFIL.handle))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(
      mocks.deleteAccount,
      'the action erased an account for a request carrying no session. The form is reachable ' +
        'without a browser, so the session check belongs in the action and not only in the page.',
    ).not.toHaveBeenCalled()
  })

  it('sends a signed-in visitor with no profile here away instead of erasing nothing loudly', async () => {
    mocks.find.mockResolvedValue({ docs: [], totalDocs: 0 })

    await expect(excluirConta(formulario(PERFIL.handle))).rejects.toThrow(/NEXT_REDIRECT/)
    expect(
      mocks.deleteAccount,
      'no profile exists for this login in this lab, and the action called deleteAccount ' +
        'anyway — with what id? One login may hold profiles in two labs (CLR-002), and this ' +
        'lab’s screen must never reach for another lab’s profile.',
    ).not.toHaveBeenCalled()
  })
})

describe('§7 — once it is done, the session goes with the account (US8)', () => {
  it('signs the person out and sends them off the account pages', async () => {
    const destino = await redirecionaPara(() => excluirConta(formulario(PERFIL.handle)))

    expect(
      mocks.signOut,
      'the account is gone and the browser still holds its session cookie. The next page it ' +
        'loads is a signed-in page for an account that no longer exists.',
    ).toHaveBeenCalledTimes(1)
    expect(destino).toBe(DESTINO_APOS_EXCLUSAO)
    expect(
      destino.startsWith('/minha-conta'),
      `the person was sent to ${destino}, which is a page their deleted account cannot load.`,
    ).toBe(false)
  })

  it('signs out only after the erasure, never before', async () => {
    const ordem: string[] = []
    mocks.deleteAccount.mockImplementation(async () => {
      ordem.push('delete')
      return { curtidasRemovidas: 0, conteudosAnonimizados: 0, perfisRestantes: 0, contaRemovida: true, jaRemovido: false }
    })
    mocks.signOut.mockImplementation(async () => void ordem.push('signOut'))

    await redirecionaPara(() => excluirConta(formulario(PERFIL.handle)))

    expect(
      ordem,
      'the session was dropped before the erasure ran. The deletion reaches Payload with the ' +
        'maker’s own credentials, so signing out first is how it loses the access it needs.',
    ).toEqual(['delete', 'signOut'])
  })

  it('lets a failed erasure reach the caller rather than reporting success', async () => {
    mocks.deleteAccount.mockRejectedValue(new Error('rollback'))

    await expect(
      excluirConta(formulario(PERFIL.handle)),
      'the action swallowed the failure. The transaction rolled back, the account is still ' +
        'there, and the person was told it was erased — the one report they cannot check.',
    ).rejects.toThrow(/rollback/)
    expect(mocks.signOut, 'a failed erasure still ended the session').not.toHaveBeenCalled()
  })
})

describe('§8 — the page is pinned to the sanctioned paths', () => {
  it('reaches Payload only through the tenancy choke point', () => {
    expect(
      PAGE_SOURCE,
      'the page does not import the choke point, so §5 is asserting against a mock of a module ' +
        'this page never calls.',
    ).toMatch(/from '(\.\.\/)+lib\/tenancy'/)
  })

  it('does not import getPayload, which the tenancy fence forbids outside lib/tenancy', () => {
    expect(PAGE_SOURCE).not.toMatch(/\bgetPayload\b/)
  })

  it('performs the erasure through lib/accounts/deletion rather than writing rows itself', () => {
    expect(
      PAGE_SOURCE,
      'the screen does its own deleting. The three outcomes are one transaction in ' +
        'deletion.ts, and a second implementation of them is a second thing to get wrong.',
    ).toMatch(/from '(\.\.\/)+lib\/accounts\/deletion'/)
  })
})
