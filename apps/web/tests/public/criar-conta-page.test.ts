import { renderToStaticMarkup } from 'react-dom/server'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LINHAS_AVATAR } from '../../collections/avatar/AvatarItem'
import { TOTAL_TONS_DE_CABELO } from '../../collections/avatar/TomDeCabelo'
import { TOTAL_TONS_DE_PELE } from '../../collections/avatar/TomDePele'
import type { FindArgs } from '../../lib/tenancy/client'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T022 / FR-001, FR-002, FR-003, US2 — step 1 of `/criar-conta`, the builder's page shell.
 *
 * The task is the **shell**, not the builder: the frame `onboarding.md` § *Estrutura da página*
 * draws (the `1 2` step indicator, `CRIE SEU AVATAR`, the left rail's two buttons, the panel
 * container) and the one thing only a server component can do — **read the catalogue through
 * the anonymous choke point**. The selection state, the composed preview and the rotation are
 * the island's (T023, T024).
 *
 * ── Why the read is the assertion with teeth ────────────────────────────────────────────────
 *
 * The catalogue is `global` (CLR-001) and the visitor at step 1 has no account (FR-003), so this
 * page is the first production caller of `PUBLIC_GLOBAL_CATALOGUE` — the three-slug allow-list
 * T006 opened in `lib/tenancy/public-payload.ts` after finding that `getPublicScopedPayload`
 * refused every `global` collection by construction and made this page unbuildable. A page that
 * hard-coded twenty skin tones would render identically and prove nothing, which is why §1 reads
 * the calls the page issued rather than only the markup it produced, and why §5 asserts that
 * every option on the page came from the rows the read returned.
 *
 * ── No database ────────────────────────────────────────────────────────────────────────────
 *
 * The page is an async function returning a plain element tree, so the choke point is mocked
 * and the tree rendered with `renderToStaticMarkup`. What the choke point does with these three
 * slugs against a real Postgres is `tests/tenancy/public-catalogue.test.ts`'s subject, already
 * proved in both directions; repeating it here would be a slower copy of that file.
 */

/** The three collections the builder's catalogue is spread across — named here rather than
 *  imported from the page, so a page that quietly stops reading one fails instead of moving
 *  this list with it. */
const CATALOGO = ['tomDePele', 'tomDeCabelo', 'avatarItem'] as const

/** Skin tones, with names no constant in the page could have invented. */
const TONS_DE_PELE = [
  { id: 1, nome: 'Pele Amanhecer', hex: '#f7d9c4', ordem: 1 },
  { id: 2, nome: 'Pele Jatobá', hex: '#6b3f2a', ordem: 2 },
  { id: 3, nome: 'Pele Carvão', hex: '#3a2a21', ordem: 3 },
]

/** Hair colours — `onboarding.md` puts this row above the panels, and the colour is separate
 *  from the cut. */
const TONS_DE_CABELO = [
  { id: 11, nome: 'Cabelo Grafite', hex: '#1c1c1c', ordem: 1 },
  { id: 12, nome: 'Cabelo Magenta', hex: '#d63a8b', ordem: 2 },
]

/** One item in four different slots, including the base-varying one (FR-004) and an optional
 *  accessory (FR-005), so a page that only draws the required slots is caught. */
const ITENS = [
  { id: 21, categoria: 'cabelo', nome: 'Moicano curto', camadaZ: 40 },
  { id: 22, categoria: 'olhos', nome: 'Olhos amendoados', camadaZ: 50 },
  // The SAME garment in both bases — the pair the first fixture did not have, and could not
  // have: with one `roupaCima` row no f/m pair was ever rendered, so the picker could print
  // every garment twice and every assertion stayed green.
  { id: 23, categoria: 'roupaCima', nome: 'Cropped listrado', compativelBase: 'f', camadaZ: 30 },
  { id: 25, categoria: 'roupaCima', nome: 'Cropped listrado', compativelBase: 'm', camadaZ: 30 },
  { id: 26, categoria: 'roupaCima', nome: 'Moletom', compativelBase: 'f', camadaZ: 30 },
  { id: 27, categoria: 'roupaCima', nome: 'Moletom', compativelBase: 'm', camadaZ: 30 },
  { id: 24, categoria: 'chapeu', nome: 'Bucket navy', camadaZ: 70 },
]

const LINHAS: Record<string, readonly Record<string, unknown>[]> = {
  tomDePele: TONS_DE_PELE,
  tomDeCabelo: TONS_DE_CABELO,
  avatarItem: ITENS,
}


/**
 * The anonymous client, recorded rather than stubbed inline: §1 reads its `calls` to prove the
 * catalogue is read through the choke point and not typed into the page.
 */
class FakeCatalogueClient {
  readonly calls: FindArgs[] = []
  readonly tenantId = 'org-fake'

  constructor(private readonly linhas: Record<string, readonly Record<string, unknown>[]>) {}

  find = async <T>(args: FindArgs): Promise<{ docs: T[]; totalDocs: number }> => {
    this.calls.push(args)
    const docs = (this.linhas[args.collection] ?? []) as T[]
    return { docs, totalDocs: docs.length }
  }

  findByID = async <T>(): Promise<T | null> => null
}

const mocks = vi.hoisted(() => {
  /** What the real `notFound()` does: it throws and never returns. Modelling that is
   *  load-bearing — a mock that returns lets execution fall through to a render the runtime
   *  would never reach. */
  const NOT_FOUND = new Error('NEXT_HTTP_ERROR_FALLBACK;404')
  return {
    NOT_FOUND,
    notFound: vi.fn((): never => {
      throw NOT_FOUND
    }),
    getPublicScopedPayloadForRSC: vi.fn(),
  }
})

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))

vi.mock('../../lib/tenancy/public-payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy/public-payload')>()),
  getPublicScopedPayloadForRSC: mocks.getPublicScopedPayloadForRSC,
}))

const { default: CriarContaPage, metadata } = await import(
  '../../app/(frontend)/criar-conta/page'
)

let client: FakeCatalogueClient

beforeEach(() => {
  vi.clearAllMocks()
  client = new FakeCatalogueClient(LINHAS)
  mocks.getPublicScopedPayloadForRSC.mockResolvedValue(client)
})

/** The page as HTML. Every section below reads the markup rather than walking the tree: the
 *  shell is anchors, headings and lists, all of which survive `renderToStaticMarkup`. */
const render = async (): Promise<string> => renderToStaticMarkup((await CriarContaPage()) as never)

/** `<a href>` → its text, tags stripped. The two buttons of the left rail are anchors (they
 *  navigate), so this is how FR-002's destinations are read. */
const linksIn = (markup: string): Record<string, string> => {
  const links: Record<string, string> = {}
  for (const [, href, inner] of markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
    links[inner!.replaceAll(/<[^>]*>/g, '').replaceAll('&#x27;', "'").trim()] = href!
  }
  return links
}

const callFor = (collection: string): FindArgs | undefined =>
  client.calls.find((call) => call.collection === collection)

describe('§1 — the catalogue is read through the anonymous choke point (FR-003, CLR-001)', () => {
  it('reads all three catalogue collections, and nothing else', async () => {
    await render()

    expect(
      client.calls.map((call) => call.collection).sort(),
      'step 1 draws the whole catalogue: the skin tones, the hair colours and the nine item ' +
        'slots. A slug missing here is a panel the page can only be drawing from a constant.',
    ).toEqual([...CATALOGO].sort())
  })

  it('reads it anonymously — the visitor at step 1 has no account', async () => {
    await render()

    // `getPublicScopedPayloadForRSC` is the ONLY client that answers with no session. The
    // request-scoped one refuses a userless request, and `masterOnly()` on these three
    // collections refuses it again — which is the state T006 found and `PUBLIC_GLOBAL_CATALOGUE`
    // exists to answer.
    expect(mocks.getPublicScopedPayloadForRSC).toHaveBeenCalled()
  })

  it('asks for the whole catalogue, not a default page of it', async () => {
    await render()

    const totalDeItens = Object.values(LINHAS_AVATAR).reduce((soma, n) => soma + n, 0)
    const minimos: Record<string, number> = {
      tomDePele: TOTAL_TONS_DE_PELE,
      tomDeCabelo: TOTAL_TONS_DE_CABELO,
      avatarItem: totalDeItens,
    }

    for (const collection of CATALOGO) {
      // Payload's default limit is 10. Under it the builder would offer ten of the twenty skin
      // tones FR-003 names, and a tenth of the item catalogue, with nothing on the page saying
      // so — the catalogue has already shrunk once by exactly this kind of silence (preamble 2).
      expect(
        callFor(collection)?.limit ?? 0,
        `${collection} is read with a limit below its catalogue size, so the builder offers ` +
          'fewer options than FR-003 fixes and the visitor is never told.',
      ).toBeGreaterThanOrEqual(minimos[collection]!)
    }
  })

  it('orders the swatch rows by `ordem`, which is what the column is for', async () => {
    await render()

    // `onboarding.md`: the skin grid runs "do mais claro ao mais escuro" and the hair row has a
    // fixed order. `ordem` carries it; sorting by anything else (or not at all) re-shuffles a
    // designed sequence into whatever the database returns.
    expect(callFor('tomDePele')?.sort).toBe('ordem')
    expect(callFor('tomDeCabelo')?.sort).toBe('ordem')
  })
})

describe('§2 — the two-step indicator (FR-001)', () => {
  it('shows `1 2` with step 1 as the current one', async () => {
    const markup = await render()

    expect(
      markup,
      'FR-001 puts the `1 2` indicator on screen, and round 4 (2026-08-24) reinstated it after ' +
        'the mockup dropped it. `aria-current="step"` is how a screen reader learns which of ' +
        'the two the visitor is on.',
    ).toMatch(/aria-current="step"/)
    expect(markup).toMatch(/Passo 1 de 2/)
    // Both numerals, so the indicator is a pair rather than a lone `1`.
    expect(markup).toMatch(/>\s*1\s*</)
    expect(markup).toMatch(/>\s*2\s*</)
  })
})

describe('§3 — the step heading (onboarding.md § Cabeçalho da etapa)', () => {
  it('draws the title and the subtitle the copy fixes', async () => {
    const markup = await render()

    expect(markup).toMatch(/<h1[^>]*>CRIE SEU AVATAR<\/h1>/)
    expect(markup).toContain('Personalize seu personagem maker do seu jeito!')
  })

  it('titles the document for the step, not for the site', async () => {
    expect(metadata.title).toMatch(/CRIE SEU AVATAR/)
  })
})

describe('§4 — the left rail`s two buttons (FR-002)', () => {
  it('sends `VOLTAR` to the Home and `SALVAR E CONTINUAR` to step 2', async () => {
    const links = linksIn(await render())

    // PO, 2026-08-24: step 1's VOLTAR leaves the flow for the Home — it is step 2's VOLTAR that
    // comes back here, with the avatar intact.
    expect(links['VOLTAR'], `the anchors found were ${JSON.stringify(links)}`).toBe('/')
    expect(links['SALVAR E CONTINUAR →']).toBe('/criar-conta/dados')
  })
})

describe('§5 — every option on the page came from the read, at the size it offers (FR-003)', () => {
  /**
   * The base card the builder draws: `F` and `M` (`BASES_AVATAR`), the one panel whose two
   * options are a product decision rather than a catalogue row.
   *
   * Counted rather than subtracted out, and it is NOT a relaxation: before T024c the page drew
   * the catalogue as static text and had no base selector at all, so the total moved by exactly
   * these two the moment `AvatarBuilder` was mounted. The assertion below keeps its whole point —
   * a `roupaCima` printing rows instead of garments still lands at 14 here, not 12.
   */
  const OPCOES_DA_BASE = 2

  /** `roupaCima` renders one entry per GARMENT for the opening base, not one per row. */
  const OPCOES_ESPERADAS =
    OPCOES_DA_BASE +
    TONS_DE_PELE.length +
    TONS_DE_CABELO.length +
    ITENS.filter((i) => i.categoria !== 'roupaCima').length +
    ITENS.filter((i) => i.categoria === 'roupaCima' && i.compativelBase === 'f').length

  it('draws every option the catalogue returned for the opening base, and invents none', async () => {
    const markup = await render()

    for (const linha of [...TONS_DE_PELE, ...TONS_DE_CABELO, ...ITENS]) {
      expect(markup, `"${linha.nome}" was read from the catalogue and never reached the page`).toContain(
        linha.nome,
      )
    }

    // The count is the half with teeth, and the half that was wrong. It used to compare against
    // ROWS RETURNED, which encoded the defect as the rule: `roupaCima` stores each garment twice
    // — an `f` sprite and an `m` sprite (`onboarding.md` § Card ROUPAS) — so rendering rows put
    // every top in the picker twice, indistinguishably, and the correct behaviour would have
    // FAILED this assertion. The fixture could not catch it either: with one `roupaCima` row
    // there was no pair to duplicate.
    const opcoes = [...markup.matchAll(/<li\b/g)].length
    expect(
      opcoes,
      `the page drew ${String(opcoes)} options where the catalogue offers ` +
        `${String(OPCOES_ESPERADAS)}. Too many means the base-varying slot is printing rows ` +
        'rather than garments — each top twice, and a visitor cannot tell the two apart. Too ' +
        'few means a slot lost its panel.',
    ).toBe(OPCOES_ESPERADAS)
  })

  it('offers each base-varying garment ONCE, not once per sprite (FR-004)', async () => {
    const markup = await render()

    // Named explicitly rather than left to the count: "10 options" would also be satisfied by
    // ten wrong ones. `Cropped listrado` exists as an `f` row and an `m` row in the fixture.
    const vezes = [...markup.matchAll(/Cropped listrado/g)].length
    expect(
      vezes,
      'the garment appears more than once, so the picker is showing the `f` sprite and the `m` ' +
        'sprite as two separate choices — the same shirt, twice, with nothing in the markup ' +
        'saying which is which',
    ).toBe(1)
  })
})

describe('§6 — the two failures a visitor can actually meet', () => {
  it('404s when no organization claims the host', async () => {
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new TenantUnresolvedError('nada.test'))

    // Serving one organization's page on another's hostname is the failure 000's US4 forbids,
    // and it is worse than an error because nobody would notice it.
    await expect(render()).rejects.toBe(mocks.NOT_FOUND)
    expect(mocks.notFound).toHaveBeenCalled()
  })

  it('reports a failed catalogue read in place, with the way out still usable', async () => {
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.getPublicScopedPayloadForRSC.mockRejectedValue(new Error('postgres is down'))

    const markup = await render()
    avisos.mockRestore()

    expect(markup).toContain('Não foi possível carregar')
    // The shell stays: a visitor who meets an outage here must still be able to leave the flow
    // rather than land on a blank page with nothing to press.
    expect(linksIn(markup)['VOLTAR']).toBe('/')
  })
})

describe('§7 — no island (FR-024)', () => {
  it('ships no `use client` of its own', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fonte = readFileSync(
      join(import.meta.dirname, '..', '..', 'app', '(frontend)', 'criar-conta', 'page.tsx'),
      'utf8',
    )

    // The shell is a server component. The one island this route is allowed is the builder
    // itself (T024, declared in `ALLOWED_ISLANDS`); a second one smuggled in here would erode
    // FR-024's bound without ever being declared.
    expect(fonte).not.toMatch(/^\s*['"]use client['"]/m)
  })
})

/**
 * T024c / FR-005, FR-007, US2 — the gate, and the builder it is a gate over.
 *
 * Three defects, one task. `avatarCompleto`/`escolhasFaltando` landed at T024b with **zero
 * callers**; the page never mounted `AvatarBuilder` at all, so the nine panels were server-
 * rendered lists nobody could press; and `SALVAR E CONTINUAR` was an **unconditional anchor**.
 * Together that is a visitor finishing step 1 with an empty avatar — the exact thing FR-005
 * forbids, and the reason the rule being *written* was never the same thing as it being *applied*.
 *
 * The state lives in the island, so the control has to: the page mounts the builder, hands it the
 * catalogue it read, and the island holds the configuration and decides whether the way forward
 * is open. These cases read that decision off the rendered markup, in both directions — shut from
 * the opening state, open from a draft that answers every required panel.
 */

/** The page as HTML, with a query on it — the returning visitor of FR-002, and the only way to
 *  reach the builder with an avatar already in it from a `node` test with no DOM to press in. */
const renderCom = async (query: Record<string, string | string[] | undefined>): Promise<string> =>
  renderToStaticMarkup((await CriarContaPage({ searchParams: Promise.resolve(query) })) as never)

/** The opening tag carrying `marcador`, e.g. `data-continuar` — so an attribute on it can be
 *  read rather than searched for loosely anywhere in the page. */
const aberturaCom = (markup: string, marcador: string): string | undefined =>
  new RegExp(`<[a-z]+[^>]*\\b${marcador}\\b[^>]*>`).exec(markup)?.[0]

/** The anchor that finishes step 1, as its opening tag. */
const tagDoContinuar = (markup: string): string | undefined =>
  /<a\b[^>]*>\s*SALVAR E CONTINUAR/.exec(markup)?.[0].replace(/>[\s\S]*$/, '>')

/** The slots FR-005 requires, in the order `escolhasFaltando` reports them: the two palettes
 *  first — they are the panels stacked above the pickers — then the seven required slots.
 *  `oculos` and `chapeu` are absent on purpose: they are the two optional ones. */
const OBRIGATORIOS = [
  'cabeloTom',
  'pele',
  'cabelo',
  'olhos',
  'nariz',
  'boca',
  'roupaCima',
  'roupaBaixo',
  'sapatos',
]

/** An avatar with every required panel answered and **neither accessory** — the half of FR-005
 *  that a gate demanding all nine slots would fail. The ids are the fixture's own rows where the
 *  catalogue has one; completeness is a question about the configuration alone (FR-007), so the
 *  three slots the fixture carries no row for are answered with ids the panels never offered. */
const AVATAR_COMPLETO = JSON.stringify({
  base: 'f',
  pele: '1',
  cabeloTom: '11',
  itens: {
    cabelo: '21',
    olhos: '22',
    nariz: 'nariz-1',
    boca: 'boca-1',
    roupaCima: '23',
    roupaBaixo: 'roupa-baixo-1',
    sapatos: 'sapatos-1',
  },
  direcao: 'frente',
})

describe('§8 — step 1 cannot be finished with an empty avatar (FR-005, US2)', () => {
  it('mounts the builder, so the panels are controls rather than a list to read', async () => {
    const markup = await render()

    // The three presses only the island answers: an item, the base, and the rotation. Before
    // T024c the page drew `<li>` text for the first, nothing at all for the other two, and the
    // largest island in the product shipped to exactly one consumer — the workbench.
    expect(
      markup,
      'the page renders the catalogue as static text: there is no `data-item` control on it, ' +
        'so nothing a visitor presses can change the avatar and the gate below has nothing to ' +
        'gate. `AvatarBuilder` is not mounted.',
    ).toMatch(/data-item="/)
    expect(markup).toMatch(/data-base="f"/)
    expect(markup).toMatch(/data-rotacao="proxima"/)
  })

  it('shuts the way forward from the opening state, where nothing is chosen', async () => {
    const markup = await render()

    const envoltorio = aberturaCom(markup, 'data-continuar')
    expect(
      envoltorio,
      'nothing in the markup marks the continue control, so there is no gate to read — ' +
        '`SALVAR E CONTINUAR` is the unconditional anchor FR-005 forbids.',
    ).toBeDefined()
    // `inert` and not a class: the visitor who opens step 1 and presses the only button on the
    // screen must not reach step 2, and a styled-to-look-disabled anchor still navigates — by
    // click, by Enter, and by the middle button that opens it in a tab nobody styled.
    expect(
      envoltorio,
      `the continue control is live from the opening state: "${envoltorio ?? ''}"`,
    ).toMatch(/\binert\b/)
    expect(tagDoContinuar(markup)).toMatch(/aria-disabled="true"/)
  })

  it('names the panels that are still unanswered, and never the optional ones', async () => {
    const markup = await render()

    const faltando = /data-faltando="([^"]*)"/.exec(await render())?.[1]
    expect(
      faltando,
      'the gate says "not yet" and nothing more. `escolhasFaltando` exists precisely so the ' +
        'person is told WHICH panel to go back to — a disabled button with no reason is a dead ' +
        'end on a screen with eleven panels on it.',
    ).toBeDefined()
    expect(faltando?.split(' ')).toEqual(OBRIGATORIOS)
    // FR-005's other half: `oculos` and `chapeu` are jewellery. A gate that demanded them would
    // be read as "the builder is broken" rather than as a rule, and nobody would find the cause.
    expect(faltando).not.toContain('oculos')
    expect(faltando).not.toContain('chapeu')
    // And the message a person reads names panels, not database keys.
    expect(markup).toContain('TONS DE CABELO')
    expect(markup).toMatch(/Ainda falta escolher/)
  })

  it('opens once every required panel is answered, accessories or not', async () => {
    const markup = await renderCom({ avatar: AVATAR_COMPLETO })

    const envoltorio = aberturaCom(markup, 'data-continuar')
    expect(envoltorio, 'the continue control is not on the page at all').toBeDefined()
    expect(
      envoltorio,
      'the returning visitor of FR-002 arrives with a finished avatar and is still locked out ' +
        'of step 2 — a gate that never opens is not a gate, it is a wall.',
    ).not.toMatch(/\binert\b/)
    expect(tagDoContinuar(markup)).not.toMatch(/aria-disabled="true"/)
    expect(markup).not.toMatch(/data-faltando/)

    // …and it still carries the draft it was handed, byte for byte (FR-002).
    expect(linksIn(markup)['SALVAR E CONTINUAR →']).toBe(
      `/criar-conta/dados?avatar=${encodeURIComponent(AVATAR_COMPLETO)}`,
    )
  })
})
