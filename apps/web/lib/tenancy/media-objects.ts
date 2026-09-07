import type { PayloadRequest } from 'payload'

/**
 * The object reader the anonymous download route injects (FR-015, FR-024, T036b).
 *
 * **Why this lives in `lib/tenancy` and not beside the route.** It reads `req.payload` — the
 * unscoped client every hook and handler is handed — and the fence in `eslint.config.mjs`
 * concentrates every such touch in this module on purpose, "deliberately object-agnostic" so
 * that no shape of it escapes review. What it takes from that client is deliberately narrow:
 * the `upload.handlers` array and nothing else. It opens no query, so it cannot read a row of
 * any organization, and it holds no client a caller could widen.
 *
 * **Why the bytes come from Payload at all.** The T036b decision (option ii, 2026-09-07) points
 * `projeto.arquivos` at the media collections instead of holding text storage keys, which means
 * the object is already reachable through the static handler `@payloadcms/storage-s3` registers
 * on every upload collection (`plugin-cloud-storage/plugin.js:74`). Option (i) — keep the keys —
 * would have made `@aws-sdk/client-s3` a direct dependency in order to re-read a bucket the
 * framework is already reading, which is a stack addition under constitution Principle 1.
 *
 * **Authorisation is not this module's job and must not be read as such.** `serveDownload`
 * consults an `ObjectSource` only after it has resolved the document through the *public* read
 * path and found that the document lists this media — so by the time a filename arrives here,
 * the caller is already entitled to those bytes. Handing this function a filename directly
 * would serve any object in the bucket, which is exactly why `downloads.ts` takes the reader as
 * a dependency rather than owning one.
 */

/**
 * What Payload registers on an upload collection so `/api/<slug>/file/<name>` serves bytes.
 * The S3 client behind it is the storage plugin's; this module only calls what is registered.
 */
type StaticHandler = (
  req: PayloadRequest,
  args: { headers?: Headers; params: { collection: string; filename: string } },
) => Promise<Response> | Response | Promise<void> | void

/** Just enough of `Payload` to reach the handler slot — the only part this module may use. */
type CollectionRegistry = {
  collections?: Record<string, { config?: { upload?: { handlers?: StaticHandler[] } } }>
}

/**
 * One object as the caller's storage hands it back.
 *
 * Structural rather than an import of `ObjectSource`/`StoredObject` from `lib/content`, for the
 * reason `PublicCounterStore` gives one file over: `lib/tenancy` does not import `lib/content`.
 * The shapes are checked against each other where they meet — at the route.
 */
export type StoredObject = {
  body: Uint8Array
  contentType?: string
}

export type ObjectReader = (filename: string) => Promise<StoredObject | null>

/** Storage's answer for "this collection does not hold that object". Ask the next one. */
const OBJECT_MISSING = 404

/** Every upload collection that actually has a handler registered, in config order. */
const registeredHandlers = (
  registry: CollectionRegistry | undefined,
): { slug: string; handlers: StaticHandler[] }[] =>
  Object.entries(registry?.collections ?? {})
    .map(([slug, collection]) => ({ slug, handlers: collection?.config?.upload?.handlers ?? [] }))
    .filter(({ handlers }) => handlers.length > 0)

/**
 * Ask one collection's registered handler for an object, or `null` if it does not hold it.
 *
 * **A non-404 failure throws rather than becoming `null`.** The reader has only two answers,
 * and folding a storage outage into "no such object" would serve a 404 for a bucket that is
 * merely down — an incident nobody can see, on the one path with no signed-in user to report
 * it. Being loud costs nothing in secrecy: the caller has already been authorised for these
 * bytes (see the module docstring), so the difference tells a prober nothing it may not know.
 */
const readFrom = async (
  req: PayloadRequest,
  slug: string,
  handlers: readonly StaticHandler[],
  filename: string,
): Promise<StoredObject | null> => {
  for (const handler of handlers) {
    const response = await handler(req, {
      headers: new Headers(),
      params: { collection: slug, filename },
    })
    if (!response || response.status === OBJECT_MISSING) continue
    if (!response.ok) {
      throw new Error(
        `object storage answered ${response.status} for ${slug}/${filename}; expected 200 with ` +
          'the bytes, or 404 when the object is absent',
      )
    }
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? undefined,
    }
  }
  return null
}

/**
 * A reader over the upload collections' own static handlers.
 *
 * **Each is asked in turn and the first that holds the object wins**, because a filename does
 * not carry the collection it belongs to: the reader is handed the `filename` off the media row
 * and nothing else. Looking the row up to learn its collection is precisely what FR-024 keeps
 * out of a route — and the T036b decision is that the download needs *no* read of the media
 * collections at all. Asking in turn needs none.
 *
 * That is correct rather than merely convenient because every media collection is adapted to
 * **one bucket with no prefix** (`s3StorageOptions` sets none) and `lib/uploads/keys.ts` gives
 * each object a UUID, so a filename names at most one object platform-wide. If a per-collection
 * prefix is ever configured this stops holding — `getFilePrefix` resolves a prefix by looking
 * the document up *inside the collection it was asked about* — and the owning collection would
 * then have to reach the reader from a caller that already knows it.
 *
 * @example
 *   return serveDownload(req, request, { objects: mediaObjectReader(req) })
 */
export const mediaObjectReader = (req: PayloadRequest): ObjectReader => {
  const registry = req.payload as unknown as CollectionRegistry | undefined

  return async (filename: string) => {
    for (const { slug, handlers } of registeredHandlers(registry)) {
      const object = await readFrom(req, slug, handlers, filename)
      if (object) return object
    }
    return null
  }
}
