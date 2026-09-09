import type { Where } from 'payload'

import { getPublicScopedPayloadForRSC } from '../tenancy/public-payload'
import { ALL_CATEGORIES, clampPage, type ListingParams } from './params'

/**
 * The **one** listing reader every public page calls (FR-002, FR-011, FR-029, T008).
 *
 * `plan.md` § "Implementation approach": *"One listing reader, not six. Every listing does the
 * same four things — filter by category, match a search term, order by publication date, take
 * a page of twelve. Written once in `lib/public/listing.ts`, so a page that forgets the
 * tenant-resolved host cannot exist."*
 *
 * ── What the caller is deliberately not allowed to say ──────────────────────────────────────
 *
 * There is no `host`, no `tenant`, no `status` and no `limit` in the argument list, and each
 * absence closes a way a page could have gone wrong:
 *
 *   - **the host** is `getPublicScopedPayloadForRSC`'s, read from the request. A page that
 *     could pass one could pass the wrong one, and nobody is signed in to notice.
 *   - **the tenant** is `buildTenantClient`'s, AND-ed onto every query.
 *   - **the status** is `getPublicScopedPayload`'s. A published-only clause restated here
 *     would be a second opinion about what "public" means, and the day the two disagree is the
 *     day drafts render — `evento` already has a four-state set where the other four have
 *     three, which is exactly the shape a per-page filter gets wrong.
 *   - **the page size** is CLR-003's decision (twelve, so no breakpoint ends on a ragged row),
 *     not a listing's.
 *
 * There is also **no client parameter**. Run 1 rejected T002 for adding a test seam to
 * `PublicPayloadOptions`, because that bag reaches any page module through
 * `getPublicScopedPayloadForRSC`; a `db` argument here would be the same widening one level
 * up — a page could hand this reader a client with no tenant constraint at all. The tests mock
 * the module instead, which nothing in production can do.
 *
 * @example
 *   const params = parseListingParams(await searchParams, { knownCategories: slugs })
 *   const { docs, page, totalPages } = await listPublic<Projeto>({ collection: 'projeto', params })
 */

/** CLR-003: twelve divides evenly into the 3-, 2- and 1-column grids. */
export const PAGE_SIZE = 12

/**
 * One level, and exactly one (plan § Sketch 1).
 *
 * *"`depth: 1` is what makes the populate-through rule work — the card's author, category and
 * cover arrive without any of those collections being publicly listable."* `depth: 0` renders
 * cards holding relationship ids; `depth: 2` walks past everything a card reads and pays for
 * it on the page whose LCP budget this feature exists to measure.
 */
const DEPTH = 1

/** The five collections a public listing enumerates. */
export type ListableCollection = 'projeto' | 'artigo' | 'aula' | 'modelo3d' | 'evento'

/**
 * What the same four operations are *called* on each collection.
 *
 * The reader is one function precisely because the operations are identical; the field names
 * are not, and pretending otherwise is a query error rather than a wrong result:
 *
 *   - `aula` declares no `categoria` at all, so the tabs the other listings draw have no
 *     vocabulary there and a category clause would name a column that does not exist.
 *   - `evento` carries **no `dataPublicacao`** — `Evento.ts` says so and gives the reason:
 *     *"The agenda's sort key, which is why this collection carries no `dataPublicacao`"*.
 *   - `projeto` carries no `autor` yet (it is deferred to feature 005's `perfilMaker` link),
 *     so its search matches two fields where the others match three.
 *
 * A map rather than five branches: adding the sixth listing is a row, and a row that forgets
 * a field does not compile.
 */
type ListingShape = {
  /** The relationship holding the category, or absent when the collection has none. */
  readonly categoria?: string
  /** The fields a search term matches (FR-020: title, description and author). */
  readonly busca: readonly string[]
  /** The date the listing orders by, descending (FR-011, CLR-007). */
  readonly ordem: string
  /**
   * The content filters this listing may narrow by, keyed by the URL parameter that carries
   * them — `nivel` → `nivelDificuldade`, and so on.
   *
   * **An allowlist, and that is the whole design.** A free `where` parameter would let a caller
   * name `tenant`, `status` or `_id`, which is exactly what Sketch 1 keeps out of this
   * function's signature: the anonymous reader decides those, never the page. Declaring the
   * filters per collection means a page can only narrow by fields this file has agreed to, and
   * a page that asks for one this collection does not declare gets an exception rather than a
   * silently unfiltered list — which is the defect this seam was added to repair.
   */
  readonly filtros?: Readonly<Record<string, FiltroShape>>
}

/**
 * One narrowable field: the document field it constrains, and how it matches.
 *
 * `in` rather than `equals` for a `hasMany` select — `modelo3d.formatos` holds several
 * extensions per model, and `equals` on a multi-value column matches a row only when the
 * column holds that one value alone.
 */
type FiltroShape = {
  readonly campo: string
  readonly operador: 'equals' | 'in'
}

const LISTING_SHAPES: Record<ListableCollection, ListingShape> = {
  projeto: {
    categoria: 'categoria',
    busca: ['titulo', 'descricaoCurta'],
    ordem: 'dataPublicacao',
  },
  artigo: {
    categoria: 'categoria',
    busca: ['titulo', 'resumo', 'autor.nome'],
    ordem: 'dataPublicacao',
  },
  aula: {
    busca: ['titulo', 'descricao', 'autor.nome'],
    ordem: 'dataPublicacao',
  },
  modelo3d: {
    categoria: 'categoria',
    busca: ['titulo', 'descricaoCurta', 'autor.nome'],
    ordem: 'dataPublicacao',
    // FR-007's two content selects. `nivelDificuldade` is CLR-006's subject — the MODEL's
    // difficulty, not the maker's level — and `formatos` is `hasMany`, hence `in`.
    filtros: {
      nivel: { campo: 'nivelDificuldade', operador: 'equals' },
      formato: { campo: 'formatos', operador: 'in' },
    },
  },
  evento: {
    busca: ['titulo', 'descricaoCurta'],
    ordem: 'inicioEm',
  },
}

/** A page of one listing, ready to render. Nothing here needs re-deriving in a component. */
export type ListingPage<T> = {
  readonly docs: T[]
  /** The page actually served — clamped, so it always exists. */
  readonly page: number
  /** At least 1, so `page` is always within range and the empty state renders on page 1. */
  readonly totalPages: number
  readonly totalDocs: number
}

/**
 * The category clause, or nothing.
 *
 * Queried through the relationship (`categoria.slug`) rather than by id: the URL carries a
 * slug because a slug is what a visitor can read and link, and resolving it to an id here
 * would mean a second read of a vocabulary the page has already loaded for its tabs.
 *
 * `TODOS` never reaches this — it is a UI state and not a row (`params.ts`) — and neither
 * does a slug on a collection with no categories, which is a URL carried over from another
 * listing rather than a filter anyone chose.
 */
const categoriaClause = (shape: ListingShape, categoria: string): Where | undefined => {
  if (categoria === ALL_CATEGORIES || shape.categoria === undefined) return undefined
  return { [`${shape.categoria}.slug`]: { equals: categoria } } as Where
}

/** The search clause, or nothing. An `or` across the collection's own text fields. */
const buscaClause = (shape: ListingShape, busca: string): Where | undefined => {
  if (busca === '') return undefined
  return { or: shape.busca.map((field) => ({ [field]: { like: busca } })) } as Where
}

/**
 * The declared content filters that carry a value, as clauses.
 *
 * An undeclared key **throws**, and the message names both the key and what this collection
 * does declare. Measured on the shipped first draft of the Biblioteca 3D page: `nivel` and
 * `formato` were parsed, validated against their option lists, written into every link and set
 * as each select's `defaultValue` — and never reached the query. A visitor chose "Avançado",
 * pressed APLICAR, and got the identical unfiltered catalogue with the select showing a filter
 * that had never been applied. Nothing was red, because there was nothing to be red: the value
 * was simply dropped. Ignoring an unknown key here would reproduce that failure inside the
 * reader, one layer further from anyone who could notice.
 */
const filtroClauses = (
  shape: ListingShape,
  filtros: Readonly<Record<string, string>>,
): Where[] => {
  const declared = shape.filtros ?? {}
  return Object.entries(filtros)
    .filter(([, valor]) => valor !== '')
    .map(([chave, valor]) => {
      const filtro = declared[chave]
      if (filtro === undefined) {
        throw new Error(
          `listPublic: no filter named ${JSON.stringify(chave)} on this listing (value ` +
            `${JSON.stringify(valor)}). Declared here: ` +
            `${Object.keys(declared).join(', ') || '(none)'}. Add it to LISTING_SHAPES with the ` +
            'document field it narrows, or stop rendering a control the query cannot honour.',
        )
      }
      return (
        filtro.operador === 'in'
          ? { [filtro.campo]: { in: [valor] } }
          : { [filtro.campo]: { equals: valor } }
      ) as Where
    })
}

/**
 * Category AND search — never `or`.
 *
 * Widening the two into an `or` would return rows outside the category whose tab stays
 * highlighted, which reads as the filter having silently failed.
 */
const whereFor = (
  shape: ListingShape,
  params: ListingParams,
  filtros: Readonly<Record<string, string>>,
): Where | undefined => {
  const clauses = [
    categoriaClause(shape, params.categoria),
    buscaClause(shape, params.busca),
    ...filtroClauses(shape, filtros),
  ].filter((clause): clause is Where => clause !== undefined)

  if (clauses.length === 0) return undefined
  return clauses.length === 1 ? clauses[0] : ({ and: clauses } as Where)
}

export async function listPublic<T = Record<string, unknown>>(args: {
  collection: ListableCollection
  /** Already parsed and validated by `params.ts`; nothing here re-checks it. */
  params: ListingParams
  /**
   * The collection-specific selects, by URL key — `{ nivel: 'avancado' }`. An empty string is
   * "no choice" and narrows nothing; a key this collection does not declare throws.
   */
  filtros?: Readonly<Record<string, string>>
}): Promise<ListingPage<T>> {
  const shape = LISTING_SHAPES[args.collection]
  const db = await getPublicScopedPayloadForRSC()

  const where = whereFor(shape, args.params, args.filtros ?? {})
  const read = (page: number) =>
    db.find<T>({
      collection: args.collection,
      where,
      depth: DEPTH,
      limit: PAGE_SIZE,
      page,
      sort: `-${shape.ordem}`,
    })

  const first = await read(args.params.page)

  // At least one page even when there are no rows: `page` must always be a page that exists,
  // or the pagination links write a URL that parses back to somewhere else and FR-010's
  // "survives a reload" stops holding on an empty listing.
  const totalPages = Math.max(1, Math.ceil(first.totalDocs / PAGE_SIZE))
  const clamped = clampPage(args.params, totalPages)

  // "Past the end" is only knowable once the total is in, so the clamp costs a second read —
  // and only on the request that was out of range. Payload answers page 999 with an empty
  // array rather than an error, so without this a stale link or a crawler renders the empty
  // state on a listing that has rows, which US2 explicitly says the empty state is not for.
  const result = clamped.page === args.params.page ? first : await read(clamped.page)

  return {
    docs: result.docs,
    page: clamped.page,
    totalPages,
    totalDocs: result.totalDocs,
  }
}
