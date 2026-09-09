import { describe, expect, it } from 'vitest'

import {
  ALL_CATEGORIES,
  clampPage,
  LISTING_PARAM_KEYS,
  listingHref,
  parseListingParams,
  type ListingParams,
} from '../../lib/public/params.js'

/**
 * The URL-state contract (FR-010, US2, T006).
 *
 * Every listing carries the same three pieces of state — category, search term, page — and
 * `plan.md` § "Implementation approach" fixes where they are decided: *"URL state is parsed
 * once, in one place"*. That sentence is the reason this module exists at all, so what is
 * tested here is not a parser's arithmetic but the two decisions the spec makes about invalid
 * input, both of which are **error cases somebody could reasonably have implemented as a
 * throw**:
 *
 *   1. **An unknown category falls back to `TODOS`** (US2's error case, verbatim: *"a category
 *      slug in the URL that does not exist in this organization falls back to `TODOS` rather
 *      than erroring or showing another organization's category"*). A visitor arriving on a
 *      stale link, or on a link from *another organization's* site, sees this organization's
 *      full listing — never a 500, and never a foreign category's rows.
 *   2. **A page past the end clamps to the last page** rather than rendering an empty grid.
 *      Clamping needs a total the parser cannot know, so it is a second step (`clampPage`),
 *      applied once the count is in — which is why it is tested separately from parsing.
 *
 * The known-category list is a **parameter**, not an import: the vocabulary is per
 * organization (`SCOPE_REGISTRY.categoriaProjeto.why` — *"a second lab names its own
 * vocabulary"*), so a module that reached for a global list would be validating against
 * CITe's categories on every host.
 */

/** The vocabulary of one organization, in the shape a page reads from `categoriaProjeto`. */
const CATEGORIAS = ['impressao-3d', 'corte-a-laser', 'serigrafia'] as const

const parse = (raw: Record<string, string | string[] | undefined> | URLSearchParams) =>
  parseListingParams(raw, { knownCategories: CATEGORIAS })

describe('parseListingParams', () => {
  it('reads category, search and page out of the query string', () => {
    expect(parse(new URLSearchParams('categoria=corte-a-laser&busca=luminaria&pagina=3'))).toEqual({
      categoria: 'corte-a-laser',
      busca: 'luminaria',
      page: 3,
    } satisfies ListingParams)
  })

  it('accepts the record shape a Next.js page receives, not only URLSearchParams', () => {
    expect(parse({ categoria: 'serigrafia', busca: 'cartaz', pagina: '2' })).toEqual({
      categoria: 'serigrafia',
      busca: 'cartaz',
      page: 2,
    })
  })

  it('defaults to the unfiltered first page when the query string is empty', () => {
    expect(parse({})).toEqual({ categoria: ALL_CATEGORIES, busca: '', page: 1 })
  })

  // US2's error case. The two hostile inputs are a stale slug and a slug that is real
  // somewhere else — both must land on the same harmless state.
  it.each([
    ['a slug this organization does not have', 'marcenaria'],
    ['a slug belonging to another organization', 'outra-org-exclusiva'],
    ['the literal filter state, which is not a row', 'todos'],
    ['an empty value', ''],
  ])('falls back to TODOS for %s', (_case, categoria) => {
    expect(parse({ categoria }).categoria).toBe(ALL_CATEGORIES)
  })

  it('keeps a known category exactly as written', () => {
    expect(parse({ categoria: 'impressao-3d' }).categoria).toBe('impressao-3d')
  })

  // A page number reaches Payload's `page` argument, so "1" is the only safe answer for
  // anything that is not a positive whole number. `parseInt` would read '12abc' as 12 and
  // '-3' as -3; neither is a page.
  it.each([
    ['zero', '0'],
    ['negative', '-3'],
    ['not a number', 'abc'],
    ['fractional', '2.5'],
    ['a number with a tail', '12abc'],
    ['empty', ''],
  ])('falls back to page 1 for %s', (_case, pagina) => {
    expect(parse({ pagina }).page).toBe(1)
  })

  it('trims the search term and treats whitespace as no search', () => {
    expect(parse({ busca: '  luminaria  ' }).busca).toBe('luminaria')
    expect(parse({ busca: '   ' }).busca).toBe('')
  })

  // Next.js hands a repeated key through as an array; the first value is the state, and a
  // duplicate must not crash the page or stringify into `a,b`.
  it('takes the first value when a key is repeated', () => {
    expect(parse({ categoria: ['serigrafia', 'impressao-3d'], pagina: ['2', '9'] })).toEqual({
      categoria: 'serigrafia',
      busca: '',
      page: 2,
    })
  })
})

describe('clampPage', () => {
  const params: ListingParams = { categoria: ALL_CATEGORIES, busca: '', page: 9 }

  it('clamps a page past the end to the last page', () => {
    expect(clampPage(params, 4).page).toBe(4)
  })

  it('leaves a page inside the range alone', () => {
    expect(clampPage(params, 12).page).toBe(9)
  })

  // An empty listing has no last page, and page 0 is not a page Payload accepts.
  it('clamps to page 1 when there is nothing to show', () => {
    expect(clampPage(params, 0).page).toBe(1)
  })

  it('changes nothing but the page', () => {
    const filtered: ListingParams = { categoria: 'serigrafia', busca: 'cartaz', page: 40 }
    expect(clampPage(filtered, 2)).toEqual({ categoria: 'serigrafia', busca: 'cartaz', page: 2 })
  })
})

describe('listingHref', () => {
  // SC-005: "Load a filtered URL directly and assert the rendered result matches". The
  // property that makes that possible is this one — what the page writes into a link is what
  // the next request parses back out.
  it('round-trips every state through the URL', () => {
    const state: ListingParams = { categoria: 'corte-a-laser', busca: 'luminaria', page: 3 }
    const href = listingHref('/projetos', state)
    expect(parse(new URLSearchParams(href.slice(href.indexOf('?'))))).toEqual(state)
  })

  it('omits the defaults so an unfiltered first page is a clean path', () => {
    expect(listingHref('/projetos', { categoria: ALL_CATEGORIES, busca: '', page: 1 })).toBe(
      '/projetos',
    )
  })

  it('encodes a search term that needs it', () => {
    const href = listingHref('/projetos', { categoria: ALL_CATEGORIES, busca: 'mesa & cadeira', page: 1 })
    expect(href).toContain('busca=mesa+%26+cadeira')
    expect(parse(new URLSearchParams(href.slice(href.indexOf('?')))).busca).toBe('mesa & cadeira')
  })
})

/**
 * ── T007: what the three criteria still left unpinned ────────────────────────────────────────
 *
 * The blocks above cover the happy shape of each criterion. These cover the cases a mutation
 * pass found still green under a changed implementation, plus the one input where the
 * round-trip was actually broken rather than merely untested.
 */

describe('the URL vocabulary is enumerated, not implied (FR-010, CHK009)', () => {
  // CHK009 asks of FR-010: *"Is the set of parameters enumerated somewhere, or only implied by
  // 'filter, search, sort and page'?"* It is enumerated here. Five listings, a tab bar, a
  // search island and a pagination control all have to spell the same three words; a fourth
  // key added on one page is a piece of state that survives no reload on the other four.
  // Sort is deliberately absent: CLR-007 fixes the order at publication-date descending, so
  // there is no sort for the URL to carry until a second ordering exists.
  it('is exactly the three keys, spelled as the markup spells them', () => {
    expect(LISTING_PARAM_KEYS).toEqual({
      categoria: 'categoria',
      busca: 'busca',
      page: 'pagina',
    })
  })

  it('parses to exactly the three pieces of state and nothing else', () => {
    expect(Object.keys(parse({})).sort()).toEqual(['busca', 'categoria', 'page'])
  })

  it('writes no key the parser does not read', () => {
    const href = listingHref('/projetos', {
      categoria: 'serigrafia',
      busca: 'cartaz',
      page: 4,
    })
    const written = [...new URLSearchParams(href.slice(href.indexOf('?'))).keys()]
    expect(written.sort()).toEqual([...Object.values(LISTING_PARAM_KEYS)].sort())
  })

  // An unknown key is a stale link or a tracking parameter, not an error: it is ignored, and
  // the state it does not name is unaffected.
  it('ignores a parameter it does not own', () => {
    expect(parse({ utm_source: 'newsletter', categoria: 'serigrafia' }).categoria).toBe(
      'serigrafia',
    )
  })
})

describe('the TODOS sentinel', () => {
  // `projetos.md`: *"`TODOS` é estado de filtro da UI, não um registro de categoria"* — and the
  // three category collections each say the same where they seed. The literal matters because
  // it is also the tab label the page specs fix, and because `listing.ts` reads it as "add no
  // category constraint": a sentinel spelled like a slug is a sentinel a lab can collide with.
  it('is the label the page specs fix', () => {
    expect(ALL_CATEGORIES).toBe('TODOS')
  })

  // The collision this pins is not hypothetical: the slug field says only *"sem acentos e sem
  // espaços"*, so a lab may well name one `todos`. If the sentinel were lowercase, that lab's
  // visitors would pick its `todos` tab and silently get the unfiltered listing.
  it('never swallows a real slug that only differs by case', () => {
    const withLowercase = parseListingParams(
      { categoria: 'todos' },
      { knownCategories: ['todos', 'serigrafia'] },
    )
    expect(withLowercase.categoria).toBe('todos')
    expect(withLowercase.categoria).not.toBe(ALL_CATEGORIES)
  })
})

describe('parseListingParams: inputs that are valid but untidy', () => {
  // The search term is trimmed above; the category is trimmed for the same reason and nothing
  // pinned it. A slug arriving with `%20` around it comes from a copy-paste, not from an
  // attack, and dropping the visitor onto the unfiltered listing loses the filter they asked
  // for.
  it('trims a category before matching it against the vocabulary', () => {
    expect(parse({ categoria: '  serigrafia  ' }).categoria).toBe('serigrafia')
    expect(parse(new URLSearchParams('categoria=%20serigrafia%20')).categoria).toBe('serigrafia')
  })
})

describe('a page number the listing can actually use', () => {
  // params.ts names *"a crawler incrementing `pagina` past the end"* as an input it narrows
  // rather than throws on. Twenty-one digits is where the narrowing broke: `Number` reads
  // `'999999999999999999999'` as `1e21`, which is not an integer Payload can offset by, and
  // whose `String()` is `'1e+21'` — so the pagination link written from that state parsed back
  // as page 1 and FR-010's "survives a reload" failed on the one input the docstring named.
  const ABSURD = '999999999999999999999'

  it('narrows a page number too large to be an integer', () => {
    const { page } = parse({ pagina: ABSURD })
    expect(Number.isSafeInteger(page)).toBe(true)
    expect(page).toBeGreaterThanOrEqual(1)
  })

  // Whatever the narrowing picks, it must still be past the end — clamping it is how the
  // visitor lands on the last page rather than on the first.
  it('leaves it past the end, so the clamp still takes it to the last page', () => {
    expect(clampPage(parse({ pagina: ABSURD }), 4).page).toBe(4)
  })

  it('survives the round trip that FR-010 requires of every state', () => {
    const state = parse({ pagina: ABSURD })
    const href = listingHref('/projetos', state)
    expect(parse(new URLSearchParams(new URL(href, 'https://cite.example').search))).toEqual(state)
  })
})

describe('round-trip: every state a listing can hold (SC-005, FR-010)', () => {
  // SC-005 loads a filtered URL directly and expects the rendered result to match. The
  // property underneath it is this one, and it has to hold for every combination rather than
  // for the one fully-populated state tested above — a page whose only state is a search term
  // writes a different URL from one that also has a category.
  const states: ReadonlyArray<[string, ListingParams]> = [
    ['nothing set', { categoria: ALL_CATEGORIES, busca: '', page: 1 }],
    ['category only', { categoria: 'impressao-3d', busca: '', page: 1 }],
    ['search only', { categoria: ALL_CATEGORIES, busca: 'luminaria', page: 1 }],
    ['page only', { categoria: ALL_CATEGORIES, busca: '', page: 7 }],
    ['category and page', { categoria: 'serigrafia', busca: '', page: 2 }],
    ['search and page', { categoria: ALL_CATEGORIES, busca: 'cartaz', page: 5 }],
    ['all three', { categoria: 'corte-a-laser', busca: 'mesa & cadeira', page: 3 }],
  ]

  // Parsed through a real URL rather than by slicing at `?`, so a state that writes no query
  // string is exercised as the browser would deliver it.
  const reload = (href: string) =>
    parse(new URLSearchParams(new URL(href, 'https://cite.example').search))

  it.each(states)('%s survives a reload', (_case, state) => {
    expect(reload(listingHref('/projetos', state))).toEqual(state)
  })

  // The URL is also the canonical form of the state: re-writing a state that came out of a URL
  // must produce the same URL, or a crawler sees two addresses for one listing.
  it.each(states)('%s writes one URL, not several', (_case, state) => {
    const href = listingHref('/projetos', state)
    expect(listingHref('/projetos', reload(href))).toBe(href)
  })
})

describe('clampPage: the boundaries', () => {
  const at = (page: number, totalPages: number) =>
    clampPage({ categoria: ALL_CATEGORIES, busca: '', page }, totalPages).page

  // FR-029 paginates with numbered pages, so the last number in the bar has to be reachable:
  // an off-by-one here hides the final twelve documents behind a link that bounces back.
  it('leaves the last page alone', () => {
    expect(at(4, 4)).toBe(4)
  })

  it('clamps the page after the last one to the last one', () => {
    expect(at(5, 4)).toBe(4)
  })

  it('leaves the first page alone', () => {
    expect(at(1, 1)).toBe(1)
  })
})
