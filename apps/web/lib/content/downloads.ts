import type { PayloadRequest } from 'payload'

import { PublicReadDeniedError, TenantUnresolvedError } from '../tenancy/errors'
import { getPublicCounterStore, getPublicScopedPayload } from '../tenancy/public-payload'
import type { HostLookup } from '../tenancy/resolve'
import { syncCounter } from './counters'

/**
 * The anonymous download (FR-015, FR-016, SC-009, SC-010, T036).
 *
 * Downloads are **open** — no account, for projects, articles and classes alike — and an
 * anonymous download is counted (PO, 2026-08-24; spec.md § Decisions 2). That combination is
 * what makes this the only place in the feature where a request nobody authenticated causes a
 * write, and the whole design of this module is about keeping that write as small as the
 * requirement allows.
 *
 * ## The order of the four steps is the security property
 *
 *   1. **Resolve the organization from the host**, never from the request. An anonymous caller
 *      supplies the document id; the host is the only thing they cannot choose (`proxy.ts`
 *      strips a client-supplied `x-tenant`). An unresolved host is a 404, never "any tenant".
 *   2. **Find the document through the public read path.** `getPublicScopedPayload` AND-s the
 *      tenant constraint and the `publicado` filter onto the query, so a document belonging to
 *      another organization — or one still in the review queue — matches zero rows and is a
 *      404 rather than a file. This single step is SC-010 and half of FR-010.
 *   3. **Check the key against the document's own `arquivos`.** Without it the *key* becomes
 *      the unit of authorisation instead of the document, and every object in the bucket is
 *      reachable by anyone who can name one — including one belonging to a draft, or to a
 *      document this reader was just refused. The object store is not consulted until this
 *      passes, so a refusal never even touches storage.
 *   4. **Count, then serve.** The counter goes through `syncCounter`, which is the one
 *      maintenance strategy of FR-020, over a store opened for exactly one column of exactly
 *      one row (`getPublicCounterStore`). Counting *before* responding means a failed counter
 *      write fails the download: a served-but-uncounted file is the silent drift the whole
 *      strategy exists to prevent, and there is no one to notice it here.
 *
 * ## What is injected, and why
 *
 * The bytes come from an injected `ObjectSource`, exactly as `presign.ts` and `verify.ts` take
 * their stores: this module owns *who may be served and what gets counted*, not the AWS SDK,
 * and a policy that can only be exercised against a live bucket is a policy CI never runs.
 * The caller supplies the reader for the storage it already has.
 *
 * **FR-024 holds.** Nothing here calls `payload.find/update` or SQL: both clients come from
 * `lib/tenancy`, and the counter write goes through the same choke point every other write in
 * the app does.
 */

/** What object storage hands back for a key. `body` is the response body, unmodified. */
export type StoredObject = {
  body: Uint8Array
  /** Sent as `content-type`. Omitted means `application/octet-stream`. */
  contentType?: string
}

/** The reader the caller supplies. `null` means the key is not in the store. */
export type ObjectSource = (key: string) => Promise<StoredObject | null>

export type DownloadRequest = {
  collection: string
  id: string | number
  /** The storage key the visitor asked for. Checked against the document, never trusted. */
  chave: string
}

export type DownloadDeps = {
  objects: ObjectSource
  /** Overrides host detection, the way `ScopedPayloadOptions.host` does for the harness. */
  host?: string
  /** Injectable so tests can resolve without `next/cache` (spike S8). */
  lookup?: HostLookup
}

/** A document's `arquivos` rows, as `Projeto` declares them: a generated key per row. */
type DocumentWithFiles = { arquivos?: { chave?: unknown }[] | null }

/**
 * One answer for every refusal, and deliberately the same one.
 *
 * "This is not published", "this belongs to another organization", "this document does not
 * carry that key" and "no organization serves this host" must be indistinguishable from
 * outside: any difference between them is an oracle an anonymous prober can use to enumerate
 * ids, hosts or keys. `scopedListEndpoint` gives the same reasoning for its own 404.
 */
const notFound = (): Response => Response.json({ error: 'Not found' }, { status: 404 })

/** `x-tenant-host` is set by `proxy.ts`, which strips any client-supplied tenant header. */
const hostFromRequest = (req: PayloadRequest): string =>
  req?.headers?.get('x-tenant-host') ?? req?.headers?.get('host') ?? ''

/**
 * Whether the document itself lists this key.
 *
 * String comparison against the stored value, with no normalisation, decoding or prefix
 * matching: every one of those is a place where "looks like the same key" and "is the same
 * key" diverge, and the divergence always favours the caller.
 */
const carriesKey = (doc: DocumentWithFiles, chave: string): boolean =>
  (doc.arquivos ?? []).some((arquivo) => String(arquivo?.chave ?? '') === chave)

/**
 * The safe characters of a generated key's last segment (`keys.ts` emits a UUID and a
 * lowercased extension from a frozen allowlist).
 *
 * A filename is echoed into a response header, and `arquivos.chave` is a *text* field a team
 * member types in the admin — so it is not guaranteed to be a generated key even though every
 * key this product writes is one. Anything outside this alphabet gets no `filename` rather
 * than a quoted-string the next parser in the chain may re-split.
 */
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/

const dispositionFor = (chave: string): string => {
  const basename = chave.split('/').pop() ?? ''
  return SAFE_FILENAME.test(basename) ? `attachment; filename="${basename}"` : 'attachment'
}

/**
 * Serve one file of one published document to a visitor with no session, and count it.
 *
 * @returns 200 with the bytes, or 404 — the single refusal for every reason to refuse.
 *
 * @example
 *   // In a route handler holding a PayloadRequest:
 *   return serveDownload(req, { collection: 'projeto', id, chave }, { objects: readFromBucket })
 */
export async function serveDownload(
  req: PayloadRequest,
  request: DownloadRequest,
  deps: DownloadDeps,
): Promise<Response> {
  const host = deps.host ?? hostFromRequest(req)

  const db = await getPublicScopedPayload(host, { lookup: deps.lookup }).catch(
    (err: unknown) => {
      // An unresolvable host is the 404 above, not a 500: "no organization here" is an
      // ordinary answer for a public surface, and distinguishing it would tell a prober
      // which hosts exist. Anything else is a real fault and must stay loud.
      if (err instanceof TenantUnresolvedError) return null
      throw err
    },
  )
  if (!db) return notFound()

  // Published-only and tenant-confined by the client itself — this is SC-010 and FR-010.
  //
  // `PublicReadDeniedError` is folded into the same 404 rather than escaping. The collection is
  // caller-supplied on the natural route shape (`/:collection/:id/download/:chave`), and the
  // anonymous client denies by default — so without this, a request naming `users`, or a slug
  // that does not exist, produced an unhandled rejection where `projeto` produced a 404. That
  // difference is exactly the oracle this function's uniform refusal exists to deny: it tells a
  // prober which collections are publicly readable, and it answers 500 to input an anonymous
  // caller controls. Measured on the real fixture world: `users` and `naoexiste` threw while
  // `projeto` returned 404.
  const doc = await db
    .findByID<DocumentWithFiles>({ collection: request.collection, id: request.id, depth: 0 })
    .catch((err: unknown) => {
      if (err instanceof PublicReadDeniedError) return null
      throw err
    })
  if (!doc || !carriesKey(doc, request.chave)) return notFound()

  const object = await deps.objects(request.chave)
  // The row points at a key storage does not have. Nothing was downloaded, so nothing is
  // counted: inflating the metric for a failed fetch is drift with a plausible excuse.
  if (!object) return notFound()

  await countDownload(req, request, { host, lookup: deps.lookup })

  return new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': object.contentType ?? 'application/octet-stream',
      'content-disposition': dispositionFor(request.chave),
    },
  })
}

/**
 * The counted half of FR-015, through the choke point of FR-016.
 *
 * `delta` rather than `count` because nothing is persisted per download — there are no source
 * rows to recompute from, which is stated in `counters.ts` and is why T031's reconciliation
 * names this counter as the one value it cannot reconcile.
 */
async function countDownload(
  req: PayloadRequest,
  request: DownloadRequest,
  where: { host: string; lookup?: HostLookup },
): Promise<void> {
  const target = { collection: request.collection, id: request.id }
  const store = await getPublicCounterStore(
    where.host,
    { ...target, field: 'downloads' },
    // The request is propagated so the increment joins the transaction of the operation
    // serving the download rather than opening a second connection beside it.
    { lookup: where.lookup, req },
  )

  await syncCounter(
    { req, target, field: 'downloads', derive: { kind: 'delta', by: 1 } },
    { getStore: async () => store },
  )
}
