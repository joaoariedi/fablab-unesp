import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FindArgs, UpdateArgs } from '../../lib/tenancy/client'

/**
 * T035 / FR-023, FR-024, US6 — **editing the avatar after signup**, and `avatarRender`
 * regenerated *only* when the configuration changes.
 *
 * ── Why the two halves need different kinds of assertion ────────────────────────────────────
 *
 * FR-023 is about what the screen is **loaded with**: the same builder as step 1, opened on the
 * avatar the person already has. A screen that mounted the builder at its defaults would look
 * completely normal — until the first save, which would replace a finished avatar with the
 * opening state of a form nobody filled in. So § 3 reads the configuration the page handed the
 * island and compares it against the stored one, field by field; rendering "a builder" is not
 * the claim.
 *
 * FR-024 is about what the save must **not** do. The requirement's word is *regenerated when the
 * configuration changes*, and the failure it forbids is invisible from the outside: a save that
 * rewrote the profile on every press would discard a render that still depicts this avatar —
 * and, once a compositor exists, pay for a new PNG per press of a button that changed nothing.
 * The only way to see it is to drive the action twice, with a changed configuration and with an
 * unchanged one, and assert against the writes the client received. § 4 does exactly that, and
 * the unchanged case asserts **no write at all** rather than "the same values written again":
 * those two are the same screen and opposite behaviours.
 *
 * ── Why an unchanged configuration is not a string comparison ───────────────────────────────
 *
 * The value that comes back from the form is re-serialised by the island from React state, so
 * its key order is the builder's, while the stored one is Postgres' `jsonb` key order. Two
 * byte-different strings routinely describe the identical avatar, which is why § 4 submits the
 * stored configuration with its keys shuffled: a page comparing strings passes every other
 * assertion here and regenerates on every save in production.
 *
 * ── Why this suite calls the page instead of rendering it ───────────────────────────────────
 *
 * Feature 001's CLR-003 keeps the stack at Vitest with no DOM, so — exactly as `minha-conta-page`
 * and `excluir-page` do — the page is awaited as the async function it is and the returned tree
 * is walked, with components matched by **identity** so a look-alike cannot satisfy them. The
 * data seams are mocked because the claim under test is what the screen does with the answers;
 * § 6 pins the page to those seams by reading its source, so a mock cannot make this suite pass
 * over a page that invented its own data path.
 */

/** The avatar this maker already has. Three slots, a skin tone and a hair colour — enough that a
 *  builder opened at its defaults is visibly a different avatar from this one. */
const CONFIG_ATUAL = {
  base: 'f',
  pele: '2',
  cabeloTom: '11',
  itens: { cabelo: '21', olhos: '22', roupaCima: '23' },
  direcao: 'frente',
}

const PERFIL = {
  id: 42,
  nome: 'Maria Silva',
  handle: 'mariasilva',
  avatarConfig: CONFIG_ATUAL,
}

/** Someone else's profile: the form must never be able to name it. */
const OUTRO_PERFIL_ID = 99

const TONS_DE_PELE = [
  { id: 1, nome: 'Pele Amanhecer', hex: '#f7d9c4', ordem: 1 },
  { id: 2, nome: 'Pele Jatobá', hex: '#6b3f2a', ordem: 2 },
]
const TONS_DE_CABELO = [{ id: 11, nome: 'Cabelo Grafite', hex: '#1c1c1c', ordem: 1 }]
const ITENS = [
  { id: 21, categoria: 'cabelo', nome: 'Moicano curto', camadaZ: 40 },
  { id: 22, categoria: 'olhos', nome: 'Olhos redondos', camadaZ: 30 },
  { id: 23, categoria: 'roupaCima', nome: 'Camiseta', camadaZ: 50, compativelBase: 'f' },
]

/** Every row the catalogue door answers with, by collection. */
const CATALOGO: Readonly<Record<string, readonly unknown[]>> = {
  tomDePele: TONS_DE_PELE,
  tomDeCabelo: TONS_DE_CABELO,
  avatarItem: ITENS,
}

/**
 * The signed-in client, recorded rather than stubbed inline.
 *
 * `update` and `create` **exist** as spies: a client missing them would make § 4's unchanged case
 * pass by `TypeError` rather than by the page not writing — the same green for the opposite
 * reason.
 */
class FakeContaClient {
  readonly leituras: FindArgs[] = []
  readonly escritas: UpdateArgs[] = []
  readonly tenantId = 'org-fake'
  readonly create = vi.fn(async () => ({}))
  readonly delete = vi.fn(async () => ({}))

  constructor(private readonly perfis: readonly unknown[] = [PERFIL]) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.leituras.push(args)
    const docs = (args.collection === 'perfilMaker' ? this.perfis : []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null

  update = vi.fn(async <T>(args: UpdateArgs): Promise<T | null> => {
    this.escritas.push(args)
    return null
  })
}

/** The anonymous door — the only one the `global` avatar catalogue opens to (CLR-001). */
class FakeCatalogoClient {
  readonly leituras: FindArgs[] = []
  readonly tenantId = 'org-fake'

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.leituras.push(args)
    const docs = (CATALOGO[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => ({
  /** What the real `redirect()` does: it throws, and never returns. A mock that returned would
   *  let execution fall through to writes the runtime never reaches. */
  redirect: vi.fn((destino: string): never => {
    throw new Error(`NEXT_REDIRECT:${destino}`)
  }),
  currentUser: vi.fn(async (): Promise<{ id: string | number } | null> => ({ id: 7 })),
  getTenantScopedPayloadForRSC: vi.fn(),
  getPublicScopedPayloadForRSC: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('../../lib/tenancy/session', () => ({ currentUser: mocks.currentUser }))
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayloadForRSC: mocks.getTenantScopedPayloadForRSC,
}))
vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const pagina = await import('../../app/(frontend)/minha-conta/avatar/page')
const {
  default: Page,
  salvarAvatar,
  avatarMudou,
  AVATAR_PATH,
  CONTA_PATH,
  CAMPO_AVATAR,
} = pagina as {
  default: (props?: unknown) => Promise<ReactNode>
  salvarAvatar: (dados: FormData) => Promise<void>
  avatarMudou: (anterior: unknown, proximo: unknown) => boolean
  AVATAR_PATH: string
  CONTA_PATH: string
  CAMPO_AVATAR: string
}

const { EditorDoAvatar } = (await import(
  '../../app/(frontend)/minha-conta/avatar/EditorDoAvatar'
)) as { EditorDoAvatar: unknown }

const PAGE_SOURCE = readFileSync(
  join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'minha-conta', 'avatar', 'page.tsx'),
  'utf8',
)

type AnyElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>

const isElement = (node: unknown): node is AnyElement =>
  typeof node === 'object' && node !== null && 'type' in node && 'props' in node

/** Every element in the tree whose `type` matches, depth first — identity, so a look-alike does
 *  not satisfy the assertion. */
function findAll(node: ReactNode, type: unknown): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const here = node.type === type ? [node] : []
  return [...here, ...findAll((node.props.children ?? null) as ReactNode, type)]
}

/** Every string the tree would print, joined. A `<style>` block is CSS, not copy. */
function texto(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(texto).join(' ')
  if (!isElement(node)) return ''
  if (node.type === 'style') return ''
  return texto((node.props.children ?? null) as ReactNode)
}

type Render = { tree: ReactNode; db: FakeContaClient; catalogo: FakeCatalogoClient }

async function renderizar(perfis: readonly unknown[] = [PERFIL]): Promise<Render> {
  const db = new FakeContaClient(perfis)
  const catalogo = new FakeCatalogoClient()
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(catalogo)
  const tree = (await Page({ searchParams: Promise.resolve({}) })) as ReactNode
  return { tree, db, catalogo }
}

/** Drives the action against a fresh client and reports what it wrote and where it went. */
async function salvar(
  campos: Record<string, string>,
  perfis: readonly unknown[] = [PERFIL],
): Promise<{ db: FakeContaClient; destino: string }> {
  const db = new FakeContaClient(perfis)
  mocks.getTenantScopedPayloadForRSC.mockResolvedValue(db)
  const dados = new FormData()
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)

  await expect(
    salvarAvatar(dados),
    'the action returned instead of redirecting; a server action that falls through leaves the ' +
      'person on a posted form with no answer.',
  ).rejects.toThrow(/NEXT_REDIRECT/)

  return { db, destino: mocks.redirect.mock.calls[0]?.[0] as string }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue({ id: 7 })
})

describe('§1 — the route exists and knows where it is', () => {
  it('is /minha-conta/avatar, and knows the page it returns to', () => {
    expect(AVATAR_PATH).toBe('/minha-conta/avatar')
    expect(CONTA_PATH).toBe('/minha-conta')
  })

  it('renders no placeholder', () => {
    expect(
      /\bPageStub\b|page-stub/.test(PAGE_SOURCE),
      'the avatar editor still renders feature 001’s placeholder, so FR-023 has no screen.',
    ).toBe(false)
  })
})

describe('§2 — who the screen is for', () => {
  it('sends a signed-out visitor to login, carrying this page as the destination', async () => {
    mocks.currentUser.mockResolvedValue(null)

    await expect(renderizar()).rejects.toThrow(/NEXT_REDIRECT/)

    const destino = mocks.redirect.mock.calls[0]?.[0] as string
    expect(destino.startsWith('/login'), `a signed-out visitor was sent to ${destino}`).toBe(true)
    expect(
      destino,
      'login is reached with no destination, so FR-016’s “return to the page they came from” ' +
        'drops the person on the Home after they sign in — with the avatar still unedited.',
    ).toContain(encodeURIComponent(AVATAR_PATH))
  })

  it('sends a signed-in person with no profile in this lab back to Minha Conta', async () => {
    await expect(renderizar([])).rejects.toThrow(/NEXT_REDIRECT/)

    expect(
      mocks.redirect.mock.calls[0]?.[0],
      'one login may hold profiles in two labs (002 § CLR-002). Having none HERE means there is ' +
        'no avatar to edit, and Minha Conta renders that state as a screen rather than bouncing ' +
        'again — so this is the one destination that cannot loop.',
    ).toBe(CONTA_PATH)
  })

  it('reads the profile by the SIGNED-IN account, never by the lab alone', async () => {
    const { db } = await renderizar()
    const leituras = db.leituras.filter((leitura) => leitura.collection === 'perfilMaker')

    expect(leituras, 'the page never read a profile').toHaveLength(1)
    expect(
      JSON.stringify(leituras[0]?.where ?? {}),
      'the profile read is not filtered by the signed-in account. `perfilMaker.update` is ' +
        '`scopedAccess()` — scoped to the LAB, not to the row (PerfilMaker.ts records the gap) ' +
        '— so a lookup by organization alone returns whichever profile came first and this ' +
        'screen edits a stranger’s avatar.',
    ).toContain('usuario')
  })
})

describe('§3 — the builder, loaded with the avatar the person already has (FR-023)', () => {
  it('mounts the editor island', async () => {
    const { tree } = await renderizar()

    expect(
      findAll(tree, EditorDoAvatar),
      'the page mounts no editor. FR-023 asks for the avatar to be editable “through the same ' +
        'builder”, and a server component cannot hold a selection that exists only after a press.',
    ).toHaveLength(1)
  })

  it('hands the editor the STORED configuration, not the builder’s opening state', async () => {
    const { tree } = await renderizar()
    const editor = findAll(tree, EditorDoAvatar)[0]

    const rascunho = editor?.props.rascunho
    expect(
      typeof rascunho,
      'the editor is mounted with no draft at all, so it opens at the defaults and the first ' +
        'save replaces a finished avatar with a form nobody filled in (FR-023).',
    ).toBe('string')
    expect(
      JSON.parse(String(rascunho)),
      'the draft handed to the builder is not this maker’s configuration.',
    ).toEqual(CONFIG_ATUAL)
  })

  it('reads the catalogue through the anonymous door, and hands it over as data', async () => {
    const { tree, catalogo } = await renderizar()
    const editor = findAll(tree, EditorDoAvatar)[0]

    expect(
      catalogo.leituras.map((leitura) => leitura.collection).sort(),
      'the avatar catalogue is `global` (CLR-001) and its collection read is `masterOnly()`, so ' +
        'the signed-in maker’s own client is refused there by construction — the three ' +
        'catalogues come through `getPublicScopedPayloadForRSC`, as step 1 reads them.',
    ).toEqual(['avatarItem', 'tomDeCabelo', 'tomDePele'])

    expect((editor?.props.itens as unknown[] | undefined) ?? [], 'no items reached the builder')
      .toHaveLength(ITENS.length)
    expect((editor?.props.peles as unknown[] | undefined) ?? [], 'no skin tones reached the builder')
      .toHaveLength(TONS_DE_PELE.length)
    expect(
      (editor?.props.cabelos as unknown[] | undefined) ?? [],
      'no hair colours reached the builder',
    ).toHaveLength(TONS_DE_CABELO.length)
  })

  it('hands the editor the server action that saves, and the field the draft travels in', async () => {
    const { tree } = await renderizar()
    const editor = findAll(tree, EditorDoAvatar)[0]

    expect(
      typeof editor?.props.acao,
      'the editor is mounted with no action, so the builder is a toy: nothing it emits can ever ' +
        'reach the profile.',
    ).toBe('function')
    expect(
      editor?.props.campo,
      'the field the configuration is posted in is not the one the action reads. Two spellings ' +
        'of one draft is how the save silently starts writing nothing.',
    ).toBe(CAMPO_AVATAR)
  })

  /** Asserted on the ELEMENT rather than on the printed page: the way back is handed to the
   *  island as a prop, and {@link texto} walks children, so a text match would read the shell and
   *  never see it. Reading the prop is also the stronger claim — it pins the destination, which a
   *  match on the word CANCELAR anywhere on the screen would not. */
  it('offers a way back to Minha Conta without saving', async () => {
    const { tree } = await renderizar()
    const editor = findAll(tree, EditorDoAvatar)[0]
    const saida = editor?.props.cancelar as AnyElement | undefined

    expect(
      saida && isElement(saida),
      'the screen has no cancel: the only way off it is to save, which is the one thing a ' +
        'person who opened it by accident must not be made to do.',
    ).toBe(true)
    expect(texto(saida ?? null), 'the way back is unlabelled').toMatch(/CANCELAR/i)
    expect(
      saida?.props.href,
      'cancelling leads somewhere other than Minha Conta, which is the page this screen was ' +
        'opened from.',
    ).toBe(CONTA_PATH)
  })
})

describe('§4 — the write happens only when the avatar actually changed (FR-024)', () => {
  it('writes the new configuration when the person changed something', async () => {
    const proximo = { ...CONFIG_ATUAL, pele: '1', itens: { ...CONFIG_ATUAL.itens, cabelo: '22' } }
    const { db, destino } = await salvar({ [CAMPO_AVATAR]: JSON.stringify(proximo) })

    expect(db.escritas, 'the changed avatar was never written').toHaveLength(1)
    expect(db.escritas[0]?.collection).toBe('perfilMaker')
    expect(
      db.escritas[0]?.id,
      'the write names a profile the form chose rather than the one the session owns.',
    ).toBe(PERFIL.id)
    expect(
      db.escritas[0]?.data.avatarConfig,
      'the profile was updated with something other than the configuration that was submitted.',
    ).toEqual(proximo)
    expect(destino, 'a saved avatar leaves the person on the editor').toBe(CONTA_PATH)
  })

  it('does not leave the OLD render in place beside a new configuration', async () => {
    const proximo = { ...CONFIG_ATUAL, base: 'm' }
    const { db } = await salvar({ [CAMPO_AVATAR]: JSON.stringify(proximo) })

    expect(
      Object.keys(db.escritas[0]?.data ?? {}),
      'the write touches `avatarConfig` and says nothing about `avatarRender` (FR-024). The ' +
        'stored PNG depicts the avatar that has just been replaced, so every card and every ' +
        'ranking row keeps drawing the old one — the single failure state worse than no render ' +
        'at all.',
    ).toContain('avatarRender')
  })

  it('writes NOTHING when the submitted configuration is the stored one', async () => {
    const { db, destino } = await salvar({ [CAMPO_AVATAR]: JSON.stringify(CONFIG_ATUAL) })

    expect(
      db.escritas,
      'the profile was rewritten by a save that changed nothing. FR-024 regenerates the render ' +
        '“when the configuration changes”: a write on every press throws away a render that ' +
        'still depicts this avatar, and pays for composing a new one for nothing.',
    ).toHaveLength(0)
    expect(destino, 'the person is left on the editor after pressing save').toBe(CONTA_PATH)
  })

  it('writes nothing when the same configuration comes back with its keys in another order', async () => {
    const embaralhado = {
      direcao: CONFIG_ATUAL.direcao,
      itens: { roupaCima: '23', cabelo: '21', olhos: '22' },
      cabeloTom: CONFIG_ATUAL.cabeloTom,
      pele: CONFIG_ATUAL.pele,
      base: CONFIG_ATUAL.base,
    }
    const { db } = await salvar({ [CAMPO_AVATAR]: JSON.stringify(embaralhado) })

    expect(
      db.escritas,
      'the same avatar, re-serialised, counted as a change. The island builds the string from ' +
        'React state while the stored one comes back in Postgres’ `jsonb` key order, so two ' +
        'byte-different strings routinely describe the identical avatar — a page comparing ' +
        'strings regenerates on every single save.',
    ).toHaveLength(0)
  })

  it('refuses a draft that is not a configuration, and writes nothing', async () => {
    const { db, destino } = await salvar({ [CAMPO_AVATAR]: 'isto não é json' })

    expect(
      db.escritas,
      'a malformed draft reached the profile. `avatarConfig` is storage, not a gate ' +
        '(PerfilMaker.ts), so this action is where the shape is checked.',
    ).toHaveLength(0)
    expect(
      destino.startsWith(AVATAR_PATH),
      `a refused save sent the person to ${destino} instead of back to the editor`,
    ).toBe(true)
  })

  it('answers the two configurations the comparison exists to tell apart', () => {
    expect(avatarMudou(CONFIG_ATUAL, { ...CONFIG_ATUAL }), 'an identical avatar read as changed')
      .toBe(false)
    expect(
      avatarMudou(CONFIG_ATUAL, { ...CONFIG_ATUAL, itens: { ...CONFIG_ATUAL.itens, chapeu: '30' } }),
      'an added accessory read as unchanged, so the render keeps depicting a bare head',
    ).toBe(true)
    expect(
      avatarMudou(null, CONFIG_ATUAL),
      'a profile with no configuration at all read as unchanged, so the first avatar a ' +
        'fixture-seeded maker builds is never written.',
    ).toBe(true)
  })
})

describe('§5 — nothing the form sends decides whose avatar is written', () => {
  it('ignores a profile id smuggled into the submission', async () => {
    const proximo = { ...CONFIG_ATUAL, direcao: 'costas' }
    const { db } = await salvar({
      [CAMPO_AVATAR]: JSON.stringify(proximo),
      id: String(OUTRO_PERFIL_ID),
      perfilId: String(OUTRO_PERFIL_ID),
      usuario: '999',
    })

    expect(db.escritas, 'the save wrote nothing at all').toHaveLength(1)
    expect(
      db.escritas[0]?.id,
      'the action wrote the profile the FORM named. Every field of a `FormData` is the sender’s ' +
        'to write, and `perfilMaker.update` is scoped to the lab rather than the row — so a ' +
        'form-chosen id edits any maker of this lab.',
    ).toBe(PERFIL.id)
  })

  it('refuses to save at all without a session', async () => {
    mocks.currentUser.mockResolvedValue(null)
    const { db, destino } = await salvar({ [CAMPO_AVATAR]: JSON.stringify(CONFIG_ATUAL) })

    expect(db.escritas, 'a signed-out POST wrote to a profile').toHaveLength(0)
    expect(destino.startsWith('/login'), `a signed-out POST was answered with ${destino}`).toBe(true)
  })
})

describe('§6 — the page is pinned to the doors it is allowed (FR-028)', () => {
  it('declares the save as a server action', () => {
    expect(
      /['"]use server['"]/.test(PAGE_SOURCE),
      'the save is not a server action. A `<form>` with no action posts a GET, which puts the ' +
        'whole configuration in the address bar and writes nothing.',
    ).toBe(true)
  })

  it('imports no payload module and touches no req.payload', () => {
    expect(
      /from\s+['"]payload['"]|req\.payload/.test(PAGE_SOURCE),
      'the page reaches past the choke point. 000’s import boundary, extended to this feature’s ' +
        'pages by T038: every signed-in read goes through `getTenantScopedPayload(req)`.',
    ).toBe(false)
  })

  it('carries no `use client` of its own', () => {
    expect(
      /^\s*['"]use client['"]/m.test(PAGE_SOURCE),
      'the page became an island. It reads two doors and holds the server action; the selection ' +
        'state belongs to `EditorDoAvatar`, which is the one seat this route pays for.',
    ).toBe(false)
  })
})
