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
  /** `roupaCima` renders one entry per GARMENT for the opening base, not one per row. */
  const OPCOES_ESPERADAS =
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
