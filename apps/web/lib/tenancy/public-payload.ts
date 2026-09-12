import { flattenAllFields, getPayload, type PayloadRequest, type Where } from 'payload'
import { cache } from 'react'

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
 */
const declaresQueryableStatus = (fields: readonly PublishableField[]): boolean =>
  flattenAllFields({ fields: fields as never }).some((field) => field.name === 'status')

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
    find: async (args) =>
      base.find({ ...args, where: and(args.where, publicWhere(args.collection)) }),

    // Issued as a constrained `find` for the same reason `findByID` is inside the builder:
    // an unpublished or foreign document must match zero rows rather than be fetched and
    // then judged. Guessing an id must not be a way past the status filter.
    findByID: async <T>(args: ByIDArgs) => {
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
  const { headers } = await import('next/headers')
  const incoming = await headers()

  // `x-tenant-host` first, for the same reason the request-scoped client prefers it:
  // proxy.ts sets it and strips any client-supplied `x-tenant`.
  const host = incoming.get('x-tenant-host') ?? incoming.get('host') ?? ''
  return getPublicScopedPayload(host, options)
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
