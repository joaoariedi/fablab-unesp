import { flattenAllFields, getPayload, type PayloadRequest, type Where } from 'payload'
import { cache } from 'react'

// `/ranking` declares the order (FR-013) and this reader honours it — see `readPublicRanking`.
// The import is of a constant, so no component is evaluated by it.
import { ORDENACAO_DO_RANKING } from '../content/ranking'

import {
  buildTenantClient,
  type ByIDArgs,
  type FindArgs,
  type PaginatedResult,
  type TenantScopedPayload,
  type UpdateArgs,
} from './client'
import { PublicReadDeniedError, PublicWriteDeniedError, TenantUnresolvedError } from './errors'
import { resolveTenant, type HostLookup, type ResolvedOrganization } from './resolve'
import { isScoped, publicListReason } from './scope-registry'

/**
 * The anonymous read path (FR-010, FR-015, SC-002).
 *
 * ⚠ **Never exported from `index.ts`.** Like `getSystemScopedPayload` it runs with
 * `overrideAccess: true`, and it is the first such client to serve *anonymous* traffic — so
 * a dropped tenant constraint or a missing status filter is a public, silent cross-tenant
 * leak rather than an error somebody sees. It is the sibling of the system client: an
 * operation with no request **user**, rather than one with no request **tenant**.
 *
 * **Why it goes around collection access instead of through it.** The multi-tenant plugin
 * AND-s its own constraint onto whatever our access function returns:
 * `withTenantAccess.js` pushes `{ tenant: { in: userTenantIDs } }` whenever `req.user`
 * exists and is not a master. A "public" branch expressed in collection access is therefore
 * nullified for a signed-in visitor from another lab — `tenant IN [A]` AND
 * `published-on-B` is empty — and a signed-in user with **no** memberships is refused by
 * that wrapper outright, before our access runs at all, so a freshly registered account
 * would see *less* than a logged-out visitor.
 *
 * The safety argument is the same one the system client makes: the tenant is **named by the
 * caller** — here, fixed by the resolved host — and never inferred from a session.
 */

export type PublicScopedPayload = {
  find: <T = Record<string, unknown>>(args: FindArgs) => Promise<PaginatedResult<T>>
  findByID: <T = Record<string, unknown>>(args: ByIDArgs) => Promise<T | null>
  /** The organization every operation above is confined to. */
  tenantId: string
}

export type PublicPayloadOptions = {
  /** Injectable so tests can resolve without `next/cache` (spike S8), as elsewhere. */
  lookup?: HostLookup
  /**
   * Overrides the derived publishable set. Injected the same way `lookup` is, because no
   * scoped collection carries `status` yet — the first arrives with `projeto` — so this is
   * the only seam through which the filter can be observed before then.
   */
  publishable?: ReadonlySet<string>
}

/**
 * The slice of a collection config the derivation reads. Structural rather than
 * `SanitizedCollectionConfig`, so the gate can be exercised against a hand-built config —
 * the only way to prove the walk before a scoped collection actually carries `status`.
 */
export type PublishableCollection = {
  slug: string
  fields: readonly PublishableField[]
}

type PublishableField = {
  name?: string
  type?: string
  /** A `select`'s own vocabulary — see {@link declaresQueryableStatus}. */
  options?: readonly (string | { value?: string })[]
  fields?: readonly PublishableField[]
  tabs?: readonly { name?: string; fields: readonly PublishableField[] }[]
}

/** The one published state. `rascunho` and `em_revisao` are the review queue (FR-008). */
const PUBLISHED_STATUS = 'publicado'

const and = (...clauses: (Where | undefined)[]): Where | undefined => {
  const present = clauses.filter((c): c is Where => Boolean(c))
  if (present.length === 0) return undefined
  return present.length === 1 ? present[0] : { and: present }
}

/**
 * True when `{ status: { equals: … } }` addresses a real field on this collection.
 *
 * The question is deliberately about the **query path**, not about the string "status"
 * appearing somewhere in the config, and the two directions fail differently:
 *   - Missing a `status` that Payload *does* flatten used to fail **open** — the collection
 *     dropped out of the set and was then served to anonymous readers with no published-only
 *     filter at all, drafts included. `assertPubliclyReadable` has since made that direction
 *     a refusal rather than a dump, but the derivation still has to be right or a legitimate
 *     public collection becomes unreadable.
 *   - Counting a `status` inside a *named* `group`, `array` or `block` fails **closed** —
 *     that field is `meta.status`, the filter matches zero rows, and the listing is empty.
 *
 * **Payload's own flattening is the oracle, not a walk of our own.** The rejected first
 * version enumerated the wrappers it knew about — `row`, `collapsible`, unnamed `tabs` — and
 * Payload flattens a fourth, the *unnamed group*, whose `status` is queryable as `status`
 * while the walk reported false. Enumerating wrappers reproduces T010's own stated premise
 * ("a hand-kept list rots") one level down: the list of collections stopped being hand-kept,
 * the list of wrappers did not. `flattenAllFields` is a public export of `payload`, so the
 * answer can be *asked* instead of re-derived, and it cannot drift from what queries do.
 *
 * **A `select` must also be able to SAY `publicado`**, and that half arrived with feature 005.
 * `missaoSubmissao` carries a `status` whose vocabulary is the review's — `enviada`, `aprovada`,
 * `recusada` — because nothing public reads a submission. Being in this set on the strength of
 * the field's *name* alone does not make its listing empty, as the second bullet above assumes;
 * on Postgres the column is an enum and the filter **throws**:
 *
 * ```text
 * Failed query: select count(*) from "missao_submissao" where "status" = $1
 *   Caused by: invalid input value for enum enum_missao_submissao_status: "publicado"
 * ```
 *
 * So the vocabulary is asked as well — of the field itself, never of a list kept here. A
 * collection whose `status` cannot express `publicado` has no published state to filter for and
 * does not belong in the set; a `status` that is not a `select` declares no vocabulary to check
 * and keeps the name-only answer, which is the conservative direction for the text and
 * radio-style fields this codebase does not have yet.
 */
const podeDizerPublicado = (field: PublishableField): boolean =>
  (field.options ?? []).some((option) =>
    typeof option === 'string' ? option === PUBLISHED_STATUS : option?.value === PUBLISHED_STATUS,
  )

const declaresQueryableStatus = (fields: readonly PublishableField[]): boolean => {
  const status = flattenAllFields({ fields: fields as never }).find(
    (field) => (field as PublishableField).name === 'status',
  ) as PublishableField | undefined
  if (!status) return false
  return status.type === 'select' ? podeDizerPublicado(status) : true
}

/**
 * The publishable set is **derived, never listed**.
 *
 * Categories, `local` and `maquina` carry no `status`, so filtering them on one would match
 * nothing at all — and a hand-kept list would rot the first time a collection gains or loses
 * the field, silently, in the direction of showing drafts. `global` collections are excluded
 * deliberately: `organizations` has a `status` of its own (`active`), and filtering it on
 * `publicado` would hide every organization from the anonymous theme read.
 *
 * @example
 *   derivePublishable(payload.config.collections).has('projeto') // true once it has status
 */
export const derivePublishable = (
  collections: readonly PublishableCollection[],
): ReadonlySet<string> =>
  new Set(
    collections
      .filter((collection) => isScoped(collection.slug))
      .filter((collection) => declaresQueryableStatus(collection.fields))
      .map((collection) => collection.slug),
  )

/**
 * One host resolution per request, instead of one per operation (FR-016, T011).
 *
 * A public page does not resolve its host once: every operation builds a client, and nested
 * relationship population multiplies that again. `resolveTenant` already has an
 * `unstable_cache` in front of it, and that is **not enough on its own** — feature 000
 * measured that it degrades when `next/cache` throws (spike S8: `Invariant:
 * incrementalCache missing` outside a Next request scope), which is exactly the Local API
 * path that tests, seeds and the Payload CLI run on. So the memo is built here, from two
 * mechanisms with opposite failure modes:
 *
 *   - `requestTenantMemo` — React's `cache()`, one map per **server request** and the whole
 *     answer inside Next. Measured to degrade on the Local API path in the same way
 *     `next/cache` does: it returns a fresh map per call rather than throwing, so it silently
 *     memoizes nothing there.
 *   - `inFlightTenantMemo` — process-wide, but holding only resolutions that have **not
 *     settled**, which collapses a concurrent fan-out wherever the request map degraded.
 *
 * Why the in-flight map is emptied the moment a resolution settles: `HostResolution.cacheable`
 * says the sovereign fallback and a miss may never be cached at all. Under a single-organization
 * install any host resolves to that organization, so keeping `b.example.com -> org A` would
 * serve org A's tenant context on org B's subdomain for as long as the entry lived. A memo
 * that outlives its request is that bug with a shorter timer, so this one does not.
 */
type TenantMemoEntry = {
  /**
   * The lookup that produced this answer. A caller that injects its own resolver — the
   * `lookup` seam tests and seeds use — must never be served an answer the default resolver
   * computed, so a different lookup is a miss rather than a hit.
   */
  lookup: HostLookup | undefined
  organization: Promise<ResolvedOrganization | null>
}

type TenantMemo = Map<string, TenantMemoEntry>

const requestTenantMemo = cache((): TenantMemo => new Map())

const inFlightTenantMemo: TenantMemo = new Map()

const resolveTenantOnce = (
  host: string,
  lookup: HostLookup | undefined,
): Promise<ResolvedOrganization | null> => {
  const perRequest = requestTenantMemo()
  const hit = perRequest.get(host) ?? inFlightTenantMemo.get(host)
  if (hit && hit.lookup === lookup) return hit.organization

  const entry: TenantMemoEntry = { lookup, organization: resolveTenant(host, lookup) }
  perRequest.set(host, entry)
  inFlightTenantMemo.set(host, entry)

  // Settled answers leave the process-wide map immediately; only the request map may keep
  // one, and its lifetime is the request. The identity check matters because a concurrent
  // caller with a different lookup replaces this entry — it must not be evicted by ours.
  void entry.organization
    .catch(() => null)
    .finally(() => {
      if (inFlightTenantMemo.get(host) === entry) inFlightTenantMemo.delete(host)
    })

  return entry.organization
}

/**
 * A read-only, host-fixed, published-only Payload client for anonymous visitors.
 *
 * @example
 *   const db = await getPublicScopedPayload('bauru.localhost')
 *   const { docs } = await db.find({ collection: 'projeto' })
 */
export async function getPublicScopedPayload(
  host: string,
  options: PublicPayloadOptions = {},
): Promise<PublicScopedPayload> {
  const organization = await resolveTenantOnce(host ?? '', options.lookup)

  // An unresolved host is an error, never a silent "every tenant" — the same asymmetry the
  // request-scoped client rests on, and the one that matters most here because nobody is
  // signed in to notice the difference.
  if (!organization) throw new TenantUnresolvedError(host)

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  const PUBLISHABLE = options.publishable ?? derivePublishable(payload.config.collections)

  /**
   * The second and last way past the gate (FR-002): a collection an anonymous page
   * **enumerates** rather than reaches by populating a published document — the filter
   * vocabularies the listing tabs and selects are drawn from. They carry no `status` at all,
   * so the question `PUBLISHABLE` answers has no answer for them and the gate could only
   * refuse; the declaration is what says an anonymous visitor may list them anyway.
   *
   * **`isScoped` is AND-ed in, and it is not redundant.** A declaration says a visitor may
   * enumerate the collection; it cannot manufacture the `tenant` column that confines the
   * enumeration to this host. `buildTenantClient` applies no tenant constraint to a `global`
   * collection, so admitting one here on the strength of its own sentence would serve every
   * organization's rows — the exact shape of the leak this gate exists to close.
   */
  /**
   * The global collections an anonymous visitor may LIST — the avatar catalogue, and nothing
   * else, ever.
   *
   * ── Why a global collection needs its own door at all ───────────────────────────────────────
   *
   * `isPubliclyListable` AND-s in `isScoped`, and the docstring above gives the reason: a
   * `publicList` sentence cannot manufacture the `tenant` column that confines an enumeration
   * to this host. That argument is right, and it makes step 1 of `/criar-conta` unreachable.
   * The avatar catalogue is `global` by CLR-001, the builder is shown to somebody who has no
   * account yet (FR-003), and `assertPubliclyReadable` therefore threw for it — so the page
   * plan.md sketches had no gate that answers. Found by this feature's own verification round,
   * not by the plan.
   *
   * ── Why these three are safe where `users` and `organizations` are not ──────────────────────
   *
   * The leak the `isScoped` guard prevents is *serving every organization's rows*. These tables
   * have no organization's rows to serve. They are product-shipped reference data — 20 skin
   * tones, 10 hair colours, the nine item slots — identical for every lab, which is precisely
   * why CLR-001 made them global instead of letting each lab name its own. "Unconstrained by
   * tenant" and "leaks across tenants" are the same sentence for `users`; for a table where
   * every row belongs to the product rather than to anyone, they are not.
   *
   * The rows carry `nome`, `hex`, `ordem`, `sprite` — no personal data, nothing a competitor
   * learns, nothing that differs by lab. A visitor sees the identical catalogue whichever host
   * they arrive on, because there is only one.
   *
   * ── Why a module constant and not a registry declaration ────────────────────────────────────
   *
   * `publicList` is a per-collection sentence anyone adding a collection can write. This is a
   * three-element allow-list in the choke point itself, so widening it is a diff in *this* file,
   * next to the reasoning, where it is reviewed as a change to the anonymous security surface.
   * It is deliberately NOT reachable through `options` — the docstring below records that an
   * injectable registry here was itself a caller-reachable deny→allow override, and this is the
   * same shape of hole with a friendlier name.
   */
  const PUBLIC_GLOBAL_CATALOGUE: ReadonlySet<string> = new Set([
    'tomDePele',
    'tomDeCabelo',
    'avatarItem',
  ])

  /**
   * A global catalogue the builder may list: in the allow-list above **and** actually `global`.
   *
   * The second half is not decoration. If one of these slugs were ever redeclared `scoped`, this
   * door would admit it while skipping the published-only filter `PUBLISHABLE` would have built
   * — a scoped collection served unfiltered, which is the 002 leak shape exactly. Then the entry
   * belongs in `publicList`, where a scoped collection's public read is supposed to be declared.
   */
  const isPublicGlobalCatalogue = (collection: string): boolean =>
    PUBLIC_GLOBAL_CATALOGUE.has(collection) && !isScoped(collection)

  const isPubliclyListable = (collection: string): boolean =>
    // Read from the REAL registry, always. An injectable registry was added here to make the
    // admission observable before T004 declared a collection — and it was a caller-reachable
    // deny→allow override on the anonymous security gate: `getPublicScopedPayloadForRSC` takes
    // this options bag, so any page module could have passed
    // `{ pendingInvites: { scope: 'scoped', publicList: 'x' } }` and served every invite row of
    // the host tenant, e-mail addresses included — the exact collection this gate's docstring
    // names as the measured 002 leak. It is not the `publishable` seam's equivalent: injecting
    // `publishable` forces a `status` clause that Payload rejects on a statusless collection,
    // so it cannot widen anything. This one widened by removing the filter entirely.
    //
    // T004 landed the real declarations, so the seam has no remaining purpose. The tests that
    // needed it now assert against the shipped registry, which is a stronger check anyway.
    isScoped(collection) && publicListReason(collection) !== undefined

  /**
   * The allow-list gate. **Deny is the default**, and that direction is the entire point.
   *
   * The rejected first version filtered when it recognised the collection and served it
   * *unfiltered* when it did not — so every way of failing to recognise one ended in a public
   * dump. Two were measured: `pendingInvites` is scoped with no `status`, so it produced no
   * filter and served its invite e-mails; `users` is `global`, so it gets no tenant constraint
   * from `buildTenantClient` either and would have served every account on the platform. The
   * caller cannot see the difference between "filtered" and "no filter was buildable", which
   * is what makes fail-open here silent rather than noisy.
   *
   * Reference data with no `status` — the categories the listing tabs read — is admitted only
   * by the `publicList` declaration above, never inferred from the absence of a field. That
   * distinction is the whole guard: "has no status" describes half the registry, including
   * `pendingInvites`, while "somebody wrote down why a visitor may list this" describes four
   * collections and has an author.
   */
  const assertPubliclyReadable = (collection: string): void => {
    if (PUBLISHABLE.has(collection)) return
    if (isPubliclyListable(collection)) return
    if (isPublicGlobalCatalogue(collection)) return
    throw new PublicReadDeniedError(
      collection,
      isScoped(collection)
        ? 'it declares no `status` field, so no published-only filter can be built for it, and no `publicList` reason saying an anonymous visitor may list it unfiltered'
        : 'it is `global`, so it carries no tenant column to confine the read to this host — a `publicList` reason cannot manufacture one',
    )
  }

  /**
   * The collections whose admission is conditional on the **projection**, not on the collection
   * (CLR-010, FR-036).
   *
   * `assertPubliclyReadable` answers "may an anonymous visitor read this collection at all?".
   * For `perfilMaker` that is the wrong granularity on its own: the `publicList` declaration is
   * collection-wide and permanent, while the columns a ranking may show are a property of the
   * call. Without this gate the day after FR-017 ships any page may write
   * `db.find({ collection: 'perfilMaker' })` and receive `dataNascimento`, `escolaridade`,
   * `curso`, `vinculoUnesp` and `usuario` — the consented personal data of feature 004 — because
   * the door would already have said yes to the collection.
   *
   * So it is the same deny-by-default `assertPubliclyReadable` uses, one level finer: the
   * collection is admitted, the unprojected *call* is refused.
   *
   * ⚠ **Field-level `read` access is not an alternative, and must not be proposed as one.** This
   * client runs with `overrideAccess: true`, and the installed Payload short-circuits on exactly
   * that — `const canReadField = overrideAccess ? true : await field.access.read({ … })` in
   * `fields/hooks/afterRead/promise.js`. A field rule would defend `perfilMaker` against
   * signed-in readers and not against the one caller in question.
   *
   * A module constant rather than a registry flag, for the reason `PUBLIC_GLOBAL_CATALOGUE`
   * gives: **removing** a slug from here is the dangerous direction, and it should be a diff in
   * this file, next to the reasoning, rather than a deleted line in a data table.
   */
  const PROJECTION_REQUIRED: ReadonlySet<string> = new Set(['perfilMaker'])

  /**
   * True when the call actually names the columns it wants.
   *
   * Two ways a `select` can be present and bound nothing, both measured against payload 3.88's
   * `getSelectMode`, which returns `'exclude'` the moment any value is `false`:
   *
   *   - `{ dataNascimento: false }` is exclude mode — every column NOT named comes back, so the
   *     four personal ones the caller forgot are served in full.
   *   - `{}` is include mode with nothing included. Harmless today (the row is `{ id }`), and
   *     refused anyway, because "carries a select object" and "says which columns may leave"
   *     have to be the same question or the next dynamically built projection satisfies the gate
   *     while naming nothing.
   */
  const namesItsColumns = (select?: Record<string, boolean>): boolean => {
    const wanted = Object.values(select ?? {})
    return wanted.length > 0 && wanted.every((keep) => keep === true)
  }

  /**
   * The projection gate. Throws for a `PROJECTION_REQUIRED` collection read without one.
   *
   * The refusal names the `select` rather than the collection's admission, because the caller
   * who trips it has a declaration in front of them that says the collection *is* listable —
   * a message about `publicList` would send them to fix something that is not broken.
   */
  const assertProjected = (collection: string, select?: Record<string, boolean>): void => {
    if (!PROJECTION_REQUIRED.has(collection)) return
    if (namesItsColumns(select)) return
    throw new PublicReadDeniedError(
      collection,
      'it carries consented personal data (`dataNascimento`, `escolaridade`, `curso`, ' +
        '`vinculoUnesp`, `usuario`) beside the columns a public board shows, so its `publicList` ' +
        'declaration admits the collection and the call must carry a `select` naming the columns ' +
        'it wants. This one names none — and an absent projection, an exclude-mode projection ' +
        '(any `false` value) or an empty one all fetch columns the caller never asked for',
    )
  }

  /* @isolation-mutation-point */
  const publishedOnly = (): Where => {
    return { status: { equals: PUBLISHED_STATUS } } as Where
  }

  /**
   * The statuses a collection shows anonymously BEYOND `publicado`.
   *
   * `projeto`, `artigo`, `aula` and `modelo3d` run the three-state review queue, where
   * `publicado` is the whole of the public set. `evento` does not: `data-model.md` gives the
   * agenda its own four states per `calendario.md`, and spec.md § Notes for planning says what
   * that means here — *"'published only' is not the same predicate on the calendar as
   * elsewhere. A cancelled event that was public must keep showing as cancelled rather than
   * vanishing."*
   *
   * Both extra states were already public and have simply moved on. Filtering them out does not
   * protect anything — it deletes the agenda's past and turns a cancellation into a silent
   * disappearance, which is the one outcome a calendar must not produce: a visitor who saw the
   * event yesterday concludes it is still on.
   *
   * **`rascunho` is not here and must never be.** It is the only status on this collection that
   * was never public, so it is the only one this map could leak. A collection absent from the
   * map keeps `publicado` alone, so the default stays the strict one and a new collection is
   * confined until someone writes a line here saying otherwise.
   */
  const PUBLIC_STATUSES_BEYOND_PUBLISHED: Readonly<Record<string, readonly string[]>> = {
    evento: ['cancelado', 'concluido'],
  }

  /**
   * The status clause for one collection: `publicado`, plus whatever that collection declares.
   *
   * Delegates to {@link publishedOnly} for the ordinary case rather than inlining the same
   * object, and that is deliberate: `scripts/isolation-mutation.sh public-path` rewrites that
   * function's exact expression to prove the anonymous gate can fail, matching it by text. A
   * rewrite of that line here would leave the mutation matching nothing and reporting success
   * on a tree it never touched — the defect `isolation-mutation-layers.test.ts` exists for.
   */
  const publiclyVisible = (collection: string): Where => {
    const beyond = PUBLIC_STATUSES_BEYOND_PUBLISHED[collection]
    if (beyond === undefined) return publishedOnly()
    return { status: { in: [PUBLISHED_STATUS, ...beyond] } } as Where
  }

  /**
   * The clause every public read is confined by, and the one place the two admissions differ.
   *
   * A `publicList` collection gets **no status clause at all**, and that is not a shortcut:
   * it has no such column, and Payload rejects the whole query rather than returning nothing
   * ("The following path cannot be queried: status"), so a defensive filter here would take
   * out the vocabulary the tabs are drawn from. `undefined` is safe precisely because it is
   * unreachable without a declaration — `assertPubliclyReadable` runs first, and the tenant
   * constraint is `buildTenantClient`'s either way.
   */
/**
 * What a **populated relationship** may return to a visitor with no account.
 *
 * ── The vector `select` does not cover, measured on this tree ────────────────────────────────
 *
 * `select` bounds the columns of the collection being *read*. It says nothing about the rows
 * Payload fetches to POPULATE a relationship on that collection — and every public listing runs
 * at `depth: 1`, so an author's name and handle arrive as art rather than as an id. An anonymous
 * read of `artigo` therefore returned the **whole** `perfilMaker` row:
 *
 *     aceiteTermosEm, aceiteTermosVersao, avatarConfig, avatarRender, createdAt, curso,
 *     dataNascimento, escolaridade, handle, id, nivel, nome, skills, tenant, updatedAt,
 *     usuario, vinculoUnesp, xpTotal
 *
 * `dataNascimento`, `vinculoUnesp`, `escolaridade` and `curso` among them — the consented fields
 * of 004's signup step 2 — through `/artigos`, `/projetos`, `/aulas`, `/biblioteca-3d` and
 * `evento.responsavel`.
 *
 * **It predates feature 006 and nothing here is a regression.** `perfilMaker.read` is
 * `scopedAccess()`, which keeps it off the REST surface, so it never reached a browser: it was
 * fetched into the server's memory on every anonymous page view and discarded unrendered. That is
 * a data-minimisation failure (LGPD art. 6, III) and one client component, one error
 * serialization or one `depth` change away from being a disclosure.
 *
 * With this, the same read returns `avatarRender, handle, id, nivel, nome` and nothing else.
 *
 * ── Why it lives here and not at the call sites ──────────────────────────────────────────────
 *
 * Six pages populate an author today and the seventh is written next week. A rule each of them has
 * to remember is a rule that holds until somebody forgets. This door is the one place every
 * anonymous read already passes through, and `assertPubliclyReadable` beside it is the precedent:
 * bound centrally, so a new page inherits the guarantee by existing rather than by being careful.
 *
 * Media is deliberately absent. `midiaImagem` and its siblings are public art, and a URL is the
 * whole of what a card wants from them.
 */
const POPULACAO_PUBLICA = {
  perfilMaker: { nome: true, handle: true, nivel: true, avatarRender: true },
} as const

  const publicWhere = (collection: string): Where | undefined => {
    assertPubliclyReadable(collection)
    return PUBLISHABLE.has(collection) ? publiclyVisible(collection) : undefined
  }

  const base = buildTenantClient({
    payload,
    tenantId: String(organization.id),
    overrideAccess: true,
  })

  return {
    tenantId: base.tenantId,

    // `buildTenantClient` AND-s the caller's `where` with the tenant constraint and
    // documents that a caller cannot widen the scope by supplying its own. The public
    // client adds one more AND — and removes the writers.
    // `async` is load-bearing, not stylistic: `publicWhere` throws for a collection the
    // allow-list refuses, and a synchronous throw out of a promise-returning method is a
    // different thing for callers to catch than a rejection. Every other method here rejects,
    // so this one must too — `.catch()` on the returned promise has to see it.
    find: async (args) => {
      // Before `publicWhere`, so the caller who omitted the projection is told about the
      // projection rather than about an admission that already exists.
      assertProjected(args.collection, args.select)
      return base.find({
        ...args,
        // The bound on populated relationships, applied to every anonymous read rather than
        // remembered by each caller — see POPULACAO_PUBLICA.
        populate: POPULACAO_PUBLICA,
        where: and(args.where, publicWhere(args.collection)),
      })
    },

    // Issued as a constrained `find` for the same reason `findByID` is inside the builder:
    // an unpublished or foreign document must match zero rows rather than be fetched and
    // then judged. Guessing an id must not be a way past the status filter.
    findByID: async <T>(args: ByIDArgs) => {
      // `ByIDArgs` carries no `select`, so a projection-required collection can never satisfy
      // the gate here — the honest answer is a refusal rather than a whole row fetched by id.
      // Guessing an id must not be the way past the projection, exactly as it is not the way
      // past the status filter. If a single public profile is ever a page, it gets a named
      // reader with its own `select`, not this method.
      assertProjected(args.collection, undefined)

      // The one global read the anonymous path is allowed, and only for the organization the
      // **host** resolved to — never an id the caller chose. It is how a logged-out visitor
      // gets their own lab's accent colour (feature 001's FR-003), and `organizations` cannot
      // go through the gate above because it is `global` and carries no `status`.
      // `find` deliberately has no such exemption: one record by its own id is the whole
      // legitimate use, and a list would hand out every organization on the platform.
      const isOwnOrganization =
        args.collection === 'organizations' && String(args.id) === base.tenantId

      const { docs } = await base.find<T>({
        collection: args.collection,
        depth: args.depth,
        limit: 1,
        where: and(
          { id: { equals: args.id } } as Where,
          isOwnOrganization ? undefined : publicWhere(args.collection),
        ),
      })
      return docs[0] ?? null
    },

    // No create/update/delete, deliberately: a public reader writes nothing. The anonymous
    // download counter (FR-016) gets its own narrow endpoint rather than widening this.
  }
}

/**
 * As much of an organization record as the anonymous path is allowed to hand out.
 *
 * Deliberately not the whole row: this client runs with `overrideAccess: true` for a caller
 * with no user, so whatever it returns is public by construction. Projecting to one field
 * here is what stops a later addition to the `organizations` collection — a contact address,
 * billing details, an invite secret — from becoming anonymously readable by the mere act of
 * being declared.
 */
export type PublicOrganizationTheme = { theme?: { primaryColor?: unknown } }

/**
 * **The calling convention for React Server Components** — `getPublicScopedPayload`'s
 * counterpart to `getTenantScopedPayloadForRSC`.
 *
 * An RSC has no `PayloadRequest`, and `next/headers` throws outside a Next request scope
 * (feature 000, spike S8), so the import is dynamic and lives here rather than in every
 * page that needs it. The host header is the *only* thing this adds: resolution, the
 * published-only filter and the missing tenant throw are all `getPublicScopedPayload`'s,
 * unchanged.
 *
 * @example
 *   const db = await getPublicScopedPayloadForRSC()
 *   const { docs } = await db.find({ collection: 'projeto' })
 */
export async function getPublicScopedPayloadForRSC(
  options: PublicPayloadOptions = {},
): Promise<PublicScopedPayload> {
  return getPublicScopedPayload(await hostDoPedido(), options)
}

/**
 * The host an anonymous RSC read is confined to — **one statement of the precedence, for every
 * anonymous door.**
 *
 * `x-tenant-host` first, for the same reason the request-scoped client prefers it: `proxy.ts`
 * sets it and strips any client-supplied `x-tenant`, so it is the one header a visitor cannot
 * choose. Falling back to `host` is what makes a direct hit on the origin resolve at all.
 *
 * Extracted when {@link getPublicLabLevelStoreForRSC} became the second door needing it (T023).
 * A second copy of these two lines would be a second place for the precedence to be got wrong,
 * and getting it wrong is a visitor naming their own tenant — the failure this file exists to
 * make impossible, not one it should spread a copy of.
 */
const hostDoPedido = async (): Promise<string> => {
  const { headers } = await import('next/headers')
  const incoming = await headers()
  return incoming.get('x-tenant-host') ?? incoming.get('host') ?? ''
}

/**
 * The organization's own theme, read for a visitor who is not signed in (FR-003 of feature
 * 001, closed here).
 *
 * **Why this read cannot go through the choke point.** `organizations.read` is `masterOnly()`
 * (lib/tenancy/access.ts) and Payload's `executeAccess` *throws* `Forbidden` on a `false`
 * result — so a logged-out visitor asking for the record of the very organization whose host
 * they are on is refused. Feature 001 shipped every downstream half of co-branding (the
 * `--color-primary` token, `themeStyle()`'s validation, the `<body>` override) and none of it
 * could ever fire. It is the same cause as the public content path, one symptom later, which
 * is why it is fixed in this module and not by widening collection access: the multi-tenant
 * plugin AND-s its own `{ tenant: { in: userTenantIDs } }` onto whatever access returns, so a
 * "public" branch there is nullified for exactly the visitors it was drawn for.
 *
 * Takes the client rather than a host so that **resolving the tenant and reading the record
 * stay two separate failures**: an unresolved host is a 404 for the whole site, while a
 * record that cannot be read is a missing accent colour and nothing more (FR-004 — a missing
 * theme is never a broken page). Merging them into one call would erase that distinction at
 * the only place it exists.
 *
 * @example
 *   const db = await getPublicScopedPayloadForRSC()
 *   const org = await readPublicOrganizationTheme(db) // { theme: { primaryColor: '#3760AA' } }
 */
export async function readPublicOrganizationTheme(
  db: PublicScopedPayload,
): Promise<PublicOrganizationTheme | null> {
  const record = await db.findByID<PublicOrganizationTheme>({
    collection: 'organizations',
    // The tenant the host resolved to, never an id a caller chose: `organizations` is
    // `global`, so the client applies no tenant constraint of its own here and this id is
    // the only thing confining the read to one organization.
    id: db.tenantId,
    depth: 0,
  })

  return record ? { theme: record.theme } : null
}

/**
 * One populated `midiaImagem`, reduced to the only field a sprite needs. Structural rather than
 * imported from `payload-types.ts`, which is gitignored: a module that imported a generated type
 * would compile locally and fail CI (tasks.md § "Read before starting").
 */
type MidiaDoc = { readonly url?: string | null }

/**
 * One place on the public board. The shape a caller may rely on — **and not the bound**, which is
 * {@link CAMPOS_DO_RANKING}: a return type erases at runtime, so it decides what the caller sees
 * and nothing at all about what the database was asked for.
 */
export type RankingRow = {
  readonly id?: string | number
  readonly nome?: string
  readonly handle?: string
  /** Populated at `depth: 1`; `null` while the compositor is blocked (FR-019, 004 T042). */
  readonly avatarRender?: MidiaDoc | string | number | null
  readonly xpTotal?: number
  readonly nivel?: number
}

/**
 * The columns the anonymous ranking is allowed to **fetch** (FR-030, FR-031, D2).
 *
 * Everything else `perfilMaker` carries — `dataNascimento`, `escolaridade`, `curso`,
 * `vinculoUnesp`, `usuario` — is consented personal data (feature 004) and is absent here, so it
 * is never read rather than read into an elevated anonymous context and dropped by convention.
 *
 * **Include mode only, every value `true`.** Payload's `getSelectMode` returns `exclude` the
 * moment any value is `false`, and an exclude-mode projection serves every column nobody thought
 * to name — which is how a field added to `perfilMaker` next year would become anonymously
 * readable by the mere act of being declared. `assertProjected` refuses such a call at the door;
 * this constant is the shape that satisfies it.
 */
export const CAMPOS_DO_RANKING = {
  id: true,
  nome: true,
  handle: true,
  avatarRender: true,
  xpTotal: true,
  nivel: true,
} as const

/**
 * This organization's makers by XP, for a visitor with **no session** (FR-017, FR-021, FR-031).
 *
 * The fifth named exemption in `lib/tenancy`, and the one that reads a table holding consented
 * personal data — so the argument is written out here rather than left to the call sites.
 *
 * ── Why this function exists at all ─────────────────────────────────────────────────────────
 *
 * Neither existing path serves an anonymous ranking. `scopedAccess()` refuses a caller with no
 * user outright, and a bare `publicList` declaration serves the **whole row**: the door's own
 * docstring says a `publicList` collection gets no status clause and no projection, which would
 * put dates of birth and courses on a public page. `readPublicOrganizationTheme` above is the
 * precedent for the *pattern* — *"deliberately not the whole row"* — and not for the mechanism:
 * it projects by mapping after a full read, and a mapping is manners, not a bound.
 *
 * ── The bound is the `select`, and that is the whole of the decision ────────────────────────
 *
 * {@link CAMPOS_DO_RANKING} is passed to the query. A `RankingRow` return type would erase at
 * runtime and leave the personal columns fetched into a function running `overrideAccess: true`
 * on behalf of nobody, one error serialization away from exposure. A field-level `read` rule is
 * **not** an alternative either: `fields/hooks/afterRead/promise.js` short-circuits on
 * `overrideAccess ? true : …`, so it would defend `perfilMaker` against signed-in readers and
 * not against this one caller.
 *
 * ── The order is imported, never retyped (FR-021) ───────────────────────────────────────────
 *
 * `ORDENACAO_DO_RANKING` is `/ranking`'s declaration, and a second literal here would be a second
 * ranking free to disagree with the page the Home card links to. The import points at the page
 * because that is where the constant is declared and tested (`tests/public/ranking-ordem.test.ts`
 * asks a real Postgres whether it orders anything at all); nothing is evaluated at module load,
 * so the reference costs a module, not a request.
 *
 * ── `depth: 1`, for `avatarRender` alone ────────────────────────────────────────────────────
 *
 * At depth 0 the relationship is an id, and an id is not art. Depth is the first lever to pull if
 * the Home's LCP budget gets thin — and the projection does **not** reach into the populated
 * document (`tests/tenancy/select.test.ts`), which is why a relationship to a collection that did
 * hold personal data could not be made safe by this select alone.
 *
 * ── `null` means the read failed; `TenantUnresolvedError` is not a failed read ───────────────
 *
 * Both callers — `/ranking` and the Home card — draw *"Não foi possível carregar"* for `null` and
 * an empty state for `[]` (FR-022), so the distinction is made once, here. An unresolved host is
 * the **site's** 404 and is rethrown: a reader that swallowed it into `null` would render an
 * error card on a host that belongs to no lab.
 *
 * @example
 *   const linhas = await readPublicRanking(5) // the Home card's top five
 */
export async function readPublicRanking(limit: number): Promise<RankingRow[] | null> {
  try {
    const db = await getPublicScopedPayloadForRSC()
    const { docs } = await db.find<RankingRow>({
      // No `where`: the tenant is the door's, and a second opinion here is a second place to
      // get it wrong.
      collection: 'perfilMaker',
      // Spread because the constant is `as const` — readonly, and `FindArgs.select` is a
      // mutable `Record<string, boolean>`. A copy per call is cheaper than either a cast
      // that hides the mismatch or a widened constant a caller could mutate.
      select: { ...CAMPOS_DO_RANKING },
      sort: ORDENACAO_DO_RANKING,
      limit,
      depth: 1,
    })
    return docs
  } catch (erro) {
    if (erro instanceof TenantUnresolvedError) throw erro
    console.warn('[ranking] a leitura pública dos perfis falhou; quem chamou reporta em lugar.', erro)
    return null
  }
}

/**
 * The three tunables the lab's curve is drawn on (FR-016, CLR-001).
 *
 * `regrasXp` carries nothing else a visitor could want and nothing personal at all — an
 * organization's XP rate, the width of a level and the cap. They are named here anyway, for the
 * reason {@link CAMPOS_DO_RANKING} is named: the row is read through a client running
 * `overrideAccess: true` on behalf of nobody, so a column added to `regrasXp` next year would
 * become anonymously readable by the mere act of being declared. Include mode, every value
 * `true` — an exclude-mode projection serves exactly those unforeseen columns.
 */
export const CAMPOS_DA_ECONOMIA = {
  xpPorAcao: true,
  xpPorNivel: true,
  nivelMaximo: true,
} as const

/**
 * The **one column** of `xpLedger` this store may fetch, and the whole of why FR-016 can be
 * closed without disclosing a lab's XP history.
 *
 * An entry also carries `perfil`, `skill`, `acao`, `chaveIdempotencia` and `createdAt`. Together
 * those are *who earned what, for which action, when* — a per-person activity log, and more than
 * the ranking's five public columns disclose. `quantidade` alone is an amount attached to
 * nobody: the sum of a page of them is a number about the lab, and the individual values are
 * indistinguishable from one another because every entry at a given rate carries the same one.
 *
 * Payload returns `id` alongside any projection and there is no way to ask it not to. An id
 * names a row, not a person: it joins to nothing this store will read.
 */
export const CAMPOS_DA_SOMA = { quantidade: true } as const

/**
 * The two collections {@link getPublicLabLevelStore} serves, each with the projection it is
 * served under. A collection absent from this map is refused — deny by default, as everywhere
 * else on this path.
 */
const LEITURAS_DO_NIVEL: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  regrasXp: CAMPOS_DA_ECONOMIA,
  xpLedger: CAMPOS_DA_SOMA,
}

/**
 * Deliberately a `Pick` of the tenant client rather than a new shape, for the reason
 * {@link PublicCounterStore} gives: `LedgerReader` in `lib/content/xp.ts` is `find` alone, so
 * this satisfies it structurally without `lib/tenancy` importing anything from `lib/content`.
 */
export type PublicLabLevelStore = Pick<TenantScopedPayload, 'find'> & {
  /** The organization the host resolved to. Every read is confined to it. */
  tenantId: string
}

export type PublicLabLevelOptions = {
  /** Injectable so tests can resolve without `next/cache` (spike S8), as everywhere else. */
  lookup?: HostLookup
}

/**
 * The **aggregate** behind the NÍVEL DO LAB card, for a visitor with no session (FR-016,
 * CLR-001) — the sixth named exemption in `lib/tenancy`, and the narrowest of them.
 *
 * ── Why it is a store and not a `readPublicX` like the ranking ──────────────────────────────
 *
 * `readPublicRanking` returns rows because rows are what the board draws. This card draws a
 * level and a bar: **three integers about the organization, naming nobody**. The rows behind
 * them must never leave, and the way to guarantee that is not to promise it in a return type —
 * a return type erases at runtime, which is the argument D2 already lost once. It is to hand
 * `nivelDoLab` a client that *cannot fetch* them, and let the arithmetic stay where 005 put it.
 * `lib/public/nivel-lab.ts` is the reader; this is the reach it is given.
 *
 * ── Why the general public door could not be widened instead ────────────────────────────────
 *
 * `assertPubliclyReadable` admits a collection by a queryable `status` or a `publicList`
 * declaration, and `xpLedger` and `regrasXp` have neither. Writing `publicList` on `xpLedger`
 * would admit it **collection-wide and unfiltered** — the door's own docstring says a
 * `publicList` collection gets no status clause and no projection — so every anonymous page read
 * would hold a client able to enumerate the lab's whole XP history. That is strictly more than
 * this card needs and more than any decision in spec.md authorises, which is why FR-016 was left
 * open at the end of phase 4 rather than closed by a declaration.
 *
 * ── The projection is FORCED, not asserted ──────────────────────────────────────────────────
 *
 * `assertProjected` on the general door *refuses* a `perfilMaker` call that names no columns,
 * because there the columns are a property of the call: two callers want different ones. Here
 * there is exactly one question this store may answer, so the store names the columns itself and
 * overwrites whatever the caller passed. The difference matters in one direction only: `find` is
 * reached from `sumLedger` and `rulesForTenant` in `lib/content/xp.ts`, shared functions with
 * other callers, and a later edit there that asked for one more column would silently widen an
 * anonymous read. Forced, it cannot.
 *
 * `depth: 0` is forced for the same reason and is not redundant with the projection: a `select`
 * does **not** reach into a populated relationship (`tests/tenancy/select.test.ts`), so a
 * populated `perfil` would arrive whole. Neither relationship is in the projection today; depth
 * is what keeps that true if one ever is.
 *
 * ── And a `where` is refused outright ───────────────────────────────────────────────────────
 *
 * The lab level sums the ledger with no filter (`nivelDoLab` — *"every entry counts, including
 * the ones that name nobody"*), so no legitimate call through this store carries one. Refusing
 * it closes the one remaining way to ask a *question about a person* with amounts alone: a
 * `where` on `perfil` would turn a sum over the lab into that maker's total, and a binary search
 * over `createdAt` would date their activity. The store answers one question or throws.
 *
 * The cross-tenant answer stays `buildTenantClient`'s: both collections are `scoped`, so the
 * tenant clause is AND-ed onto every read and the broadest thing expressible here is one lab.
 *
 * @example
 *   const store = await getPublicLabLevelStore('bauru.localhost')
 *   const nivel = await nivelDoLab(SEM_PEDIDO, { getStore: async () => store })
 */
export async function getPublicLabLevelStore(
  host: string,
  options: PublicLabLevelOptions = {},
): Promise<PublicLabLevelStore> {
  const organization = await resolveTenantOnce(host ?? '', options.lookup)

  // Same asymmetry as every door here: an unresolved host is an error, never "any tenant".
  if (!organization) throw new TenantUnresolvedError(host)

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  const base = buildTenantClient({
    payload,
    tenantId: String(organization.id),
    overrideAccess: true,
  })

  return {
    tenantId: base.tenantId,

    find: async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
      const projecao = LEITURAS_DO_NIVEL[args.collection]
      if (projecao === undefined) {
        throw new PublicReadDeniedError(
          args.collection,
          'this store was opened for the lab level alone, which is the sum of `xpLedger` on the ' +
            'curve `regrasXp` declares. It serves those two collections and no other — every ' +
            'read it makes is anonymous and answers to no access control, so its reach is the ' +
            'question it was opened for and nothing adjacent to it',
        )
      }

      if (args.where !== undefined) {
        throw new PublicReadDeniedError(
          args.collection,
          'it carries a `where`, and the lab level is the organization\'s WHOLE ledger on its ' +
            'whole economy — no legitimate read through this store filters. A filter is how a ' +
            'sum over the lab becomes a question about a person: `perfil` would return one ' +
            'maker\'s total and `createdAt` would date their activity, both out of amounts this ' +
            'store is allowed to hand out precisely because they name nobody',
        )
      }

      return base.find<T>({
        ...args,
        // Last, and deliberately after the spread: the caller's projection and depth are
        // OVERWRITTEN rather than merged. `sumLedger` and `rulesForTenant` are shared functions
        // in `lib/content/xp.ts` with signed-in callers of their own, and an edit there must not
        // be able to widen what an anonymous visitor reads.
        select: { ...projecao },
        depth: 0,
      })
    },
  }
}

/**
 * {@link getPublicLabLevelStore}'s calling convention for React Server Components — the host
 * comes from the request, exactly as {@link getPublicScopedPayloadForRSC} takes it, through the
 * one {@link hostDoPedido} that states the precedence.
 */
export async function getPublicLabLevelStoreForRSC(
  options: PublicLabLevelOptions = {},
): Promise<PublicLabLevelStore> {
  return getPublicLabLevelStore(await hostDoPedido(), options)
}

/**
 * The **one write** an anonymous visitor may cause (FR-015, FR-016, T036).
 *
 * A download is served without an account and is counted, so US4 is the only place in the
 * product where a request nobody authenticated has to move a column. `getPublicScopedPayload`
 * deliberately exposes no writer — a public reader writes nothing — and widening it would put
 * `update` on the same object every anonymous page read already holds. This is the narrow
 * endpoint that docstring promises instead.
 *
 * **Opened for one column of one row, and nothing else.** The client runs with
 * `overrideAccess: true` on behalf of a visitor with no session, so anything it *can* write is
 * something an anonymous request can write. Confining it to the host's tenant is not enough:
 * that still leaves `status: 'publicado'` on every row of the host organization inside the
 * download path's reach, which is T033's publish guard fenced around through the one door
 * FR-015 has to leave open. So the target is named when the store is opened — after the caller
 * has already resolved that document through the *public read* path, which is what proves it
 * is published and belongs to this host — and every other operation raises
 * `PublicWriteDeniedError`.
 *
 * **`find` refuses outright.** `downloads` is a `delta` derivation precisely because nothing is
 * persisted per download (counters.ts, plan § Sketch 7), so there are no source rows for this
 * store to count and a listing here would only ever be a widening.
 *
 * The cross-tenant answer stays `buildTenantClient`'s: the tenant clause is AND-ed onto the
 * update, so a store opened on A's host matches **no row** for B's document and returns `null`
 * rather than throwing — which `syncCounter` turns into `CrossTenantError`.
 *
 * @example
 *   const store = await getPublicCounterStore(host, { collection: 'projeto', id, field: 'downloads' })
 *   await syncCounter({ req, target: { collection: 'projeto', id }, field: 'downloads',
 *                       derive: { kind: 'delta', by: 1 } }, { getStore: async () => store })
 */
export type PublicCounterTarget = {
  collection: string
  id: string | number
  /** The single column this store may write. Any other key in `data` is refused. */
  field: string
}

export type PublicCounterOptions = {
  /** Injectable so tests can resolve without `next/cache` (spike S8), as everywhere else. */
  lookup?: HostLookup
  /**
   * The request the download is being served under, propagated so the counter joins **its**
   * transaction rather than opening a second connection — the property `counters.ts` rests on
   * and `system-payload.ts` measured the cost of losing.
   */
  req?: PayloadRequest
}

/**
 * Deliberately a `Pick` of the tenant client rather than a new shape: `CounterStore` in
 * `lib/content/counters.ts` is the same three operations, so this satisfies it structurally
 * without `lib/tenancy` importing anything from `lib/content`.
 */
export type PublicCounterStore = Pick<TenantScopedPayload, 'find' | 'findByID' | 'update'> & {
  /** The organization the host resolved to. Every operation is confined to it. */
  tenantId: string
}

export async function getPublicCounterStore(
  host: string,
  target: PublicCounterTarget,
  options: PublicCounterOptions = {},
): Promise<PublicCounterStore> {
  const organization = await resolveTenantOnce(host ?? '', options.lookup)

  // Same asymmetry as the read path, and it matters more here: nobody is signed in to notice
  // that a missing tenant quietly became "any tenant" on a write.
  if (!organization) throw new TenantUnresolvedError(host)

  const payload = await getPayload({ config: (await import('../../payload.config')).default })
  const base = buildTenantClient({
    payload,
    tenantId: String(organization.id),
    overrideAccess: true,
    ...(options.req ? { req: options.req } : {}),
  })

  const assertTarget = (collection: string, id: string | number): void => {
    if (collection === target.collection && String(id) === String(target.id)) return
    throw new PublicWriteDeniedError(
      `${collection} ${String(id)}`,
      `this store was opened for ${target.collection} ${String(target.id)} only`,
    )
  }

  const assertField = (data: Record<string, unknown>): void => {
    const other = Object.keys(data).filter((key) => key !== target.field)
    if (other.length === 0) return
    throw new PublicWriteDeniedError(
      `${target.collection}.${other.join(', ')}`,
      `this store may write "${target.field}" and nothing else`,
    )
  }

  return {
    tenantId: base.tenantId,

    find: async () => {
      throw new PublicWriteDeniedError(
        'a listing',
        'a delta counter has no source rows to count, so nothing here needs to list',
      )
    },

    findByID: async <T>(args: ByIDArgs) => {
      // The read half of a read-modify-write on the counter, and it is checked for the same
      // reason the write is: an unchecked one would hand the download path a way to read any
      // row of the host organization, drafts included, through a client that answers to no
      // access control.
      assertTarget(args.collection, args.id)
      return base.findByID<T>(args)
    },

    update: async <T>(args: UpdateArgs) => {
      assertTarget(args.collection, args.id)
      assertField(args.data)
      return base.update<T>(args)
    },
  }
}
