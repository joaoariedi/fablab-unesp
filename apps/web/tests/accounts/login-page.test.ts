import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T013 / FR-014, FR-016, US3 — the login page replaces feature 001's placeholder, refuses every
 * failed attempt with **one** message, and sends a maker back where they came from.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * Feature 001's CLR-003 keeps the stack at Vitest with no DOM, so nothing here paints. A React
 * server component is a plain async function returning a plain object, so awaiting it and walking
 * the tree asserts the markup it actually builds — the hidden `destino` the form carries, the
 * neutral message, the two credential fields. What it cannot prove is that a browser submits the
 * form; feature 003's Playwright owns that.
 *
 * ── Why the session seam is mocked rather than driven ───────────────────────────────────────
 *
 * `lib/tenancy/session` reaches a real Postgres through Payload's auth. The claim under test is
 * not "Payload authenticates" — T014, T015 and T016 drive the real thing — it is *what the page
 * does with the answers it can get*: a signed-in visitor, a refused attempt, and a successful one.
 * §5 pins the page to that seam by reading its source, so a mock cannot make this suite pass over
 * a page that invented its own data path or imported `getPayload` past the tenancy fence.
 *
 * ── The neutrality assertion, and why three causes rather than one ──────────────────────────
 *
 * FR-014 is a claim about *indistinguishability*, and a test that drives one failure cannot see
 * it. §4 drives the three Payload can raise — unknown address, wrong password, locked account —
 * with distinguishing text in each error, and demands one byte-identical outcome. "Account
 * locked" reveals that an address is registered exactly as surely as "no such user" does, which
 * is why the lock is in the list rather than treated as a different kind of answer.
 */

const mocks = vi.hoisted(() => ({
  /** What the real `redirect()` does: it throws, and never returns. A mock that returned would
   *  let execution fall through to a render the runtime never reaches. */
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  headers: vi.fn(async () => new Headers()),
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => null),
  signIn: vi.fn(async (): Promise<void> => {}),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('../../lib/tenancy/session', () => ({
  currentUser: mocks.currentUser,
  signIn: mocks.signIn,
}))

const pagina = await import('../../app/(frontend)/login/page.js')
const { default: Page, entrar, caminhoInterno, MENSAGEM_NEUTRA, DESTINO_PADRAO } = pagina

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'login', 'page.tsx'),
  'utf8',
)

const HOST = 'cite.fablab.test'

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

/** Every string the tree would print, joined — the visitor-visible copy. */
function texto(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  // A `<style>` block is CSS, not copy: folding it in would let a class name satisfy an
  // assertion about a message.
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

const comReferer = (referer: string | null) => {
  const h = new Headers({ host: HOST })
  if (referer !== null) h.set('referer', referer)
  mocks.headers.mockResolvedValue(h)
}

const renderizar = async (query: Record<string, string> = {}): Promise<ReactNode> =>
  (await Page({ searchParams: Promise.resolve(query) })) as unknown as ReactNode

/** The value the form would submit as the post-login destination. */
async function destinoOferecido(query: Record<string, string> = {}): Promise<string | undefined> {
  const campo = findAll(await renderizar(query), 'input').find(
    (input) => input.props.type === 'hidden',
  )
  expect(campo, 'the form carries no hidden destination field at all').toBeDefined()
  return campo?.props.value as string | undefined
}

/** Drives something that must redirect, and returns where to. */
async function redirecionaPara(acao: () => Promise<unknown>): Promise<string> {
  await expect(acao()).rejects.toThrow(/NEXT_REDIRECT/)
  expect(mocks.redirect, 'the page redirected more than once').toHaveBeenCalledTimes(1)
  return mocks.redirect.mock.calls[0]?.[0] as string
}

const formulario = (email: string, senha: string, destino?: string): FormData => {
  const dados = new FormData()
  dados.set('email', email)
  dados.set('senha', senha)
  if (destino !== undefined) dados.set('destino', destino)
  return dados
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue(null)
  mocks.signIn.mockResolvedValue(undefined)
  comReferer(null)
})

describe('§1 — the placeholder is gone and a real form stands in its place (FR-014)', () => {
  it('no longer renders feature 001’s stub', () => {
    expect(
      /\bPageStub\b|page-stub/.test(PAGE_SOURCE),
      'the login route still renders the feature-001 placeholder. T013 replaces it: a stub ' +
        'answers a visitor pressing ENTRAR with nothing at all.',
    ).toBe(false)
  })

  it('renders one form collecting exactly an e-mail and a password', async () => {
    const forms = findAll(await renderizar(), 'form')
    expect(forms, 'the page renders no <form>, so nothing can be submitted').toHaveLength(1)

    const campos = findAll(await renderizar(), 'input')
      .filter((input) => input.props.type !== 'hidden')
      .map((input) => ({ name: input.props.name, type: input.props.type }))

    expect(
      campos,
      'FR-014 is e-mail and password. A third visible field, or a password field typed as ' +
        'text, is a different form from the one the requirement describes.',
    ).toEqual([
      { name: 'email', type: 'email' },
      { name: 'senha', type: 'password' },
    ])
  })

  it('hands the submit to a server action rather than posting somewhere by hand', async () => {
    const [form] = findAll(await renderizar(), 'form')
    expect(
      typeof form?.props.action,
      'the form’s action is not the page’s own action. A hand-written URL here would post ' +
        'credentials to a path nothing in this suite watches.',
    ).toBe('function')
  })
})

describe('§2 — a signed-in visitor never sees the form (US3 edge)', () => {
  it('redirects to Minha Conta instead of offering a second sign-in', async () => {
    mocks.currentUser.mockResolvedValue({ id: 7 })

    expect(await redirecionaPara(() => renderizar())).toBe(DESTINO_PADRAO)
  })

  it('renders the form for a visitor with no session', async () => {
    expect(findAll(await renderizar(), 'form')).toHaveLength(1)
    expect(mocks.redirect, 'a signed-out visitor was redirected away from login').not.toHaveBeenCalled()
  })
})

describe('§3 — return to origin, and only to somewhere on this site (FR-016)', () => {
  it('offers the page the visitor came from', async () => {
    comReferer(`https://${HOST}/projetos/cadeira-parametrica?pagina=2`)

    expect(await destinoOferecido()).toBe('/projetos/cadeira-parametrica?pagina=2')
  })

  it('falls back to Minha Conta on a direct visit', async () => {
    comReferer(null)

    expect(
      await destinoOferecido(),
      'a visitor who opened /login directly — or through PERFIL — lands on Minha Conta ' +
        '(login.md, PO 2026-08-24).',
    ).toBe(DESTINO_PADRAO)
  })

  it('refuses a referer from another site', async () => {
    comReferer('https://evil.example/armadilha')

    expect(
      await destinoOferecido(),
      'an off-site referer became the post-login destination, which turns the login form ' +
        'into an open redirect anyone can aim by linking to it.',
    ).toBe(DESTINO_PADRAO)
  })

  it('refuses login itself, which would be a loop', async () => {
    comReferer(`https://${HOST}/login?erro=1`)

    expect(await destinoOferecido()).toBe(DESTINO_PADRAO)
  })

  it('prefers an explicit destination over the referer, so a refused attempt keeps it', async () => {
    comReferer(`https://${HOST}/login?erro=1`)

    expect(await destinoOferecido({ de: '/aulas/impressao-3d' })).toBe('/aulas/impressao-3d')
  })

  /**
   * The rule, not a list of spellings — and the case that proves why the difference matters.
   *
   * The first version of this test enumerated five hostile strings and the guard was written to
   * refuse exactly those five: no `//`, no backslash, no CR, no LF. It shipped an **open
   * redirect**. The WHATWG parser strips TAB exactly as it strips CR and LF, so
   * `/<TAB>/evil.example/x` passed every check and resolved to `https://evil.example/x` — and
   * the round trip made it worse rather than better: the value survived the render-time check,
   * went into the hidden field, came back from the browser, passed the re-validation that was
   * supposed to make the hidden field safe, and reached `redirect()`, where Next resolves it
   * with `new URL(location, base)` and navigates off-site.
   *
   * So the assertion below is no longer "these six are refused". It is **"whatever survives,
   * resolves back onto this host"**, checked with the same parser the browser uses. A guard
   * that refuses six spellings and admits the seventh cannot pass it.
   */
  it('lets nothing through that resolves off this host, however it is spelled', async () => {
    const TAB = String.fromCharCode(9)
    const CR = String.fromCharCode(13)
    const LF = String.fromCharCode(10)

    const hostis = [
      'https://evil.example/x',
      '//evil.example/x',
      '/\\evil.example/x',
      // The three the URL parser strips. TAB is the one the character blocklist missed, and it
      // is here as a named regression rather than as one more row: `%09` in the query string is
      // all it took, and `?de=` is attacker-supplied by construction.
      `/${TAB}/evil.example/x`,
      `/${CR}/evil.example/x`,
      `/${LF}//evil.example/x`,
      'javascript:alert(1)',
      'projetos',
      '',
    ]

    for (const hostil of hostis) {
      const oferecido = await destinoOferecido({ de: hostil })
      // Asserted, not coerced: an absent field would make the resolution below throw for the
      // wrong reason, and `String(undefined)` would resolve to a path on this host and PASS.
      expect(oferecido, 'the form offered no destination at all').toBeTypeOf('string')
      const resolvido = new URL(oferecido as string, `https://${HOST}`)

      expect(
        resolvido.host,
        `the form offered ${JSON.stringify(oferecido)} for the hostile destination ` +
          `${JSON.stringify(hostil)}, which a browser resolves to ${resolvido.href} — off this ` +
          'site, to a destination the attacker chose. This is the phishing amplifier the guard ' +
          'exists to stop.',
      ).toBe(HOST)
    }
  })

  it('keeps an honest destination, normalised exactly as the browser would read it', () => {
    // The other half: a guard that refused everything would pass the case above. The value
    // returned is the PARSER's, so what gets redirected to is what was validated — a
    // differential between the two readings is how the first draft admitted a URL that later
    // resolved somewhere else.
    expect(caminhoInterno('/projetos?pagina=2#ancora')).toBe('/projetos?pagina=2#ancora')
    expect(caminhoInterno('/a/../../b'), 'returned unnormalised, this is validated as one path and navigated as another').toBe('/b')
  })

  it('returns the maker to that destination once the credentials are accepted', async () => {
    expect(await redirecionaPara(() => entrar(formulario('maria@exemplo.br', 'senha', '/aulas')))).toBe(
      '/aulas',
    )
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'maria@exemplo.br', senha: 'senha' })
  })

  it('re-checks the destination on submit — the field is the visitor’s to edit', async () => {
    expect(
      await redirecionaPara(() =>
        entrar(formulario('maria@exemplo.br', 'senha', 'https://evil.example/x')),
      ),
      'the action trusted the hidden field. It arrives from the browser, so validating it ' +
        'only when rendering validates nothing.',
    ).toBe(DESTINO_PADRAO)
  })
})

describe('§4 — one message for every cause (FR-014, US3 error)', () => {
  const CAUSAS = {
    'unknown address': new Error('No user with that email was found'),
    'wrong password': new Error('The password provided is incorrect'),
    'locked account': new Error('This user is locked due to having too many failed login attempts'),
  }

  it('sends every refused attempt to the same place', async () => {
    const destinos: string[] = []
    for (const causa of Object.values(CAUSAS)) {
      vi.clearAllMocks()
      mocks.signIn.mockRejectedValue(causa)
      destinos.push(await redirecionaPara(() => entrar(formulario('maria@exemplo.br', 'errada'))))
    }

    expect(
      new Set(destinos).size,
      `the three refusals answered differently:\n  ${destinos.join('\n  ')}\n` +
        'Any difference — a distinct parameter, a distinct path — is the oracle FR-014 ' +
        'exists to deny: a prober learns which addresses are registered.',
    ).toBe(1)
  })

  it('echoes neither the address nor the password back into the URL', async () => {
    mocks.signIn.mockRejectedValue(CAUSAS['wrong password'])

    const destino = await redirecionaPara(() =>
      entrar(formulario('maria@exemplo.br', 'senha-secreta')),
    )

    expect(
      destino,
      'the refusal put the submitted credentials in a URL, where they reach the browser ' +
        'history, the referer of the next request and every access log in between (FR-020).',
    ).not.toMatch(/maria|exemplo|secreta/)
  })

  it('prints the neutral message, in the words login.md fixes', async () => {
    expect(MENSAGEM_NEUTRA).toBe('E-mail ou senha incorretos')

    const destino = await (async () => {
      mocks.signIn.mockRejectedValue(CAUSAS['unknown address'])
      return redirecionaPara(() => entrar(formulario('maria@exemplo.br', 'errada')))
    })()

    vi.clearAllMocks()
    const query = Object.fromEntries(new URL(destino, `https://${HOST}`).searchParams)
    const copia = texto(await renderizar(query))

    expect(copia, 'the refused attempt renders no message at all').toContain(MENSAGEM_NEUTRA)
    expect(
      copia,
      'the page named the cause. The message must reveal neither which half failed nor ' +
        'whether the address is registered.',
    ).not.toMatch(/senha incorreta|não encontrad|bloquead|e-mail não|usuário/i)
  })

  it('shows nothing on a first visit — the message is the answer to an attempt', async () => {
    expect(texto(await renderizar())).not.toContain(MENSAGEM_NEUTRA)
  })

  it('keeps the credentials out of whatever it logs (FR-020)', async () => {
    const avisos: unknown[][] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => void avisos.push(args))
    const erro = vi.spyOn(console, 'error').mockImplementation((...args) => void avisos.push(args))
    mocks.signIn.mockRejectedValue(CAUSAS['wrong password'])

    await redirecionaPara(() => entrar(formulario('maria@exemplo.br', 'senha-secreta')))

    spy.mockRestore()
    erro.mockRestore()
    expect(
      JSON.stringify(avisos),
      'the refusal logged the submitted credentials. A password in a log line is a password ' +
        'in every log sink downstream of it (FR-020, SC-005).',
    ).not.toMatch(/maria|exemplo|secreta/)
  })
})

describe('§5 — the page is pinned to the sanctioned auth path', () => {
  it('reaches Payload only through lib/tenancy’s session seam', () => {
    expect(
      PAGE_SOURCE,
      'the page does not import the session seam, so §2–§4 above are asserting against a ' +
        'mock of a module this page never calls.',
    ).toMatch(/from '(\.\.\/)+lib\/tenancy\/session'/)
  })

  it('does not import getPayload, which the tenancy fence forbids outside lib/tenancy', () => {
    expect(PAGE_SOURCE).not.toMatch(/\bgetPayload\b/)
  })
})
