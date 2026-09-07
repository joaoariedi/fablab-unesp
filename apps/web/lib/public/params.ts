/**
 * The URL-state contract, parsed and validated **once** (FR-010, US2, T006).
 *
 * `plan.md` § "Implementation approach": *"URL state is parsed once, in one place. …an unknown
 * category falls back to `TODOS` rather than erroring (US2's error case), and a page number
 * past the end clamps to the last page rather than showing an empty grid."* Five listings read
 * the same three pieces of state, and a per-page parser means five chances to disagree about
 * what `?pagina=0` means — on pages where disagreeing means a 500 for a visitor who followed a
 * stale link.
 *
 * ── Why nothing here throws ─────────────────────────────────────────────────────────────────
 *
 * Every input is a query string a stranger controls: a bookmark from before a category was
 * renamed, a link copied from *another organization's* site, a crawler incrementing `pagina`
 * past the end. None of those is an error a visitor can act on, and each has a correct
 * rendering — the unfiltered listing, or its last page. So invalid input **narrows to a valid
 * state** rather than raising; the only thing a `throw` here would buy is a 500 on a page whose
 * whole job is to be publicly readable.
 *
 * ── Why the vocabulary is a parameter and not an import ─────────────────────────────────────
 *
 * `SCOPE_REGISTRY.categoriaProjeto.why` records the reason categories are scoped: *"a second
 * lab names its own vocabulary; a global set would impose CITe's"*. A module that imported a
 * category list would validate every host against CITe's, which is the *"showing another
 * organization's category"* half of US2's error case arriving through the back door. The
 * caller reads the vocabulary through the tenant-scoped client and passes it in.
 *
 * ── Why clamping is a second step ───────────────────────────────────────────────────────────
 *
 * "Past the end" is not knowable from the URL — it needs a total the listing only has after it
 * has counted. So parsing produces a page number that is *shaped* like a page (a whole number,
 * at least 1) and `clampPage` narrows it to one that *exists*, once `listing.ts` has the count.
 */

/**
 * The category filter's "no filter" state.
 *
 * `TODOS` is a UI state and **not** a row — `CategoriaProjeto.ts`, `CategoriaArtigo.ts` and
 * `CategoriaModelo.ts` each say so where they seed, and nothing seeds it. It therefore never
 * reaches a `where` clause as a category slug; `listing.ts` reads it as "add no category
 * constraint".
 */
export const ALL_CATEGORIES = 'TODOS'

/**
 * The query-string keys, exported because they are shared with the markup that *writes* them:
 * the search island's `name`, the tab bar's hrefs and the pagination links all have to spell
 * the same words this module reads. Portuguese, like the rest of the visitor-facing surface and
 * like the one key the page specs already fix (`artigos.md`: *"Filtro na URL
 * (`?categoria=educacao`)"*).
 */
export const LISTING_PARAM_KEYS = {
  categoria: 'categoria',
  busca: 'busca',
  /** `page` in code (plan § Sketch 1 reads `args.params.page`), `pagina` in the URL. */
  page: 'pagina',
} as const

/** The validated URL state every listing reads. Nothing here needs re-checking downstream. */
export type ListingParams = {
  /** A slug the caller declared known, or `ALL_CATEGORIES`. Never an arbitrary string. */
  readonly categoria: string
  /** The trimmed search term; `''` means no search, never `undefined`. */
  readonly busca: string
  /** A whole number ≥ 1. Within the listing's real range only after `clampPage`. */
  readonly page: number
}

/**
 * The two shapes a query string arrives in: Next.js hands a page its `searchParams` as a record
 * whose values may be repeated, and `URLSearchParams` is what a test or a link-builder has.
 * Accepting both is what keeps this the only parser — the alternative is a page normalising
 * one shape into the other first, which is a second place where `?pagina=0` gets an opinion.
 */
export type RawListingParams = Record<string, string | string[] | undefined> | URLSearchParams

export type ParseListingParamsOptions = {
  /** This organization's category slugs, read through the tenant-scoped client. */
  readonly knownCategories: readonly string[]
}

/**
 * The first value for a key, because a repeated key is a real request.
 *
 * `?categoria=a&categoria=b` reaches a Next.js page as `['a', 'b']`. Joining or stringifying it
 * yields `'a,b'` — a category that exists nowhere, which would at least fall back safely, and a
 * page number that is `NaN`. First-wins is the same rule `URLSearchParams.get` already applies,
 * so both input shapes behave identically.
 */
const firstValue = (raw: RawListingParams, key: string): string => {
  const value = raw instanceof URLSearchParams ? raw.get(key) : raw[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * A page number, or 1.
 *
 * Deliberately not `parseInt`: it reads `'12abc'` as 12 and `'-3'` as -3, so a malformed URL
 * would reach Payload's `page` argument as a number nobody wrote. Only an unsigned run of
 * digits is a page, and `0` is not one — Payload pages are 1-based.
 *
 * A run of digits can still be too long to be an integer, and that is the crawler case this
 * module's header names: `Number('999999999999999999999')` is `1e21`, which Payload would
 * offset by as a float, and whose `String()` is `'1e+21'` — so the link the pagination writes
 * from that state parsed back as page 1 and FR-010's "survives a reload" failed on exactly the
 * input the docstring promised to narrow. It saturates at the largest integer instead, which
 * is still past the end of any real listing, so `clampPage` takes it to the last page rather
 * than dropping the visitor back onto the first.
 */
const parsePage = (value: string): number => {
  if (!/^\d+$/.test(value)) return 1
  const page = Number(value)
  if (!Number.isSafeInteger(page)) return Number.MAX_SAFE_INTEGER
  return page >= 1 ? page : 1
}

/**
 * Turn a query string into state a listing can use without re-checking anything.
 *
 * ```ts
 * const params = parseListingParams(await searchParams, { knownCategories: slugs })
 * // ?categoria=marcenaria (renamed last month) → { categoria: 'TODOS', busca: '', page: 1 }
 * ```
 */
export const parseListingParams = (
  raw: RawListingParams,
  { knownCategories }: ParseListingParamsOptions,
): ListingParams => {
  const categoria = firstValue(raw, LISTING_PARAM_KEYS.categoria).trim()
  return {
    // US2's error case: unknown, foreign and absent all land on the unfiltered listing. Note
    // that `TODOS` itself is not a known slug, so a literal `?categoria=todos` lands here too —
    // correctly, since it is the state it names.
    categoria: knownCategories.includes(categoria) ? categoria : ALL_CATEGORIES,
    busca: firstValue(raw, LISTING_PARAM_KEYS.busca).trim(),
    page: parsePage(firstValue(raw, LISTING_PARAM_KEYS.page).trim()),
  }
}

/**
 * Narrow a parsed page to one the listing actually has (US2, FR-029).
 *
 * Called by `listing.ts` with the total it has just counted. A listing with nothing in it has
 * no last page, so it clamps to 1 rather than to 0 — the empty state renders on page 1, and 0
 * is not a page Payload accepts.
 */
export const clampPage = (params: ListingParams, totalPages: number): ListingParams => {
  const lastPage = Math.max(1, Math.floor(totalPages))
  return params.page <= lastPage ? params : { ...params, page: lastPage }
}

/**
 * The inverse of `parseListingParams`: the URL that renders this state (SC-005).
 *
 * Round-tripping is the property the whole contract rests on — the tabs, the pagination links
 * and the search island all navigate by *writing a URL*, and SC-005 loads one directly and
 * expects the same result. Defaults are omitted so an unfiltered first page is a clean path
 * rather than `?categoria=TODOS&busca=&pagina=1`, which would give one listing several URLs
 * and hand crawlers duplicates of it.
 *
 * ```ts
 * <Pagination hrefFor={(n) => listingHref('/projetos', { ...params, page: n })} … />
 * ```
 */
export const listingHref = (pathname: string, params: ListingParams): string => {
  const query = new URLSearchParams()
  if (params.categoria !== ALL_CATEGORIES) query.set(LISTING_PARAM_KEYS.categoria, params.categoria)
  if (params.busca !== '') query.set(LISTING_PARAM_KEYS.busca, params.busca)
  if (params.page > 1) query.set(LISTING_PARAM_KEYS.page, String(params.page))
  const queryString = query.toString()
  return queryString === '' ? pathname : `${pathname}?${queryString}`
}
