import { extname } from 'node:path'

import type { PayloadRequest } from 'payload'

import { getTenantScopedPayload, normalizeRefs, type TenantScopedPayload } from '../../lib/tenancy'

/**
 * **`formatos`, derived from the uploaded files at save** (FR-020, T039).
 *
 * `data-model.md` § Derived values states the rule: the extensions of `arquivosModelo`,
 * computed on save. It is FR-020's fourth derived value and the only one that is not a
 * counter, so `lib/content/counters.ts` deliberately does not own it — it is derived from the
 * document being written rather than counted across rows, and its docstring hands the job to
 * this collection's `beforeChange`.
 *
 * **Why it needs a query at all.** A relationship arrives as ids, and an id carries no
 * extension; the filename lives on the uploaded document. So the derivation reads the media
 * rows — through `getTenantScopedPayload(req)`, on the **caller's own request**, for the two
 * reasons the counter module records: `req.payload` would read every organization's uploads
 * (FR-013, FR-024), and a fresh request would leave the transaction the save is running in,
 * which is how a value derived from rows that then roll back gets stored anyway.
 *
 * **The derivation owns the field, so a request cannot supply it.** `admin.readOnly` greys
 * the admin input and stops nothing coming through the API — the lesson CLR-001 recorded on
 * the approval stamp. Assigning unconditionally is what makes the filter's values match the
 * files, including the emptying case: files removed, formats removed.
 *
 * **`data` is not the whole truth.** A partial update (`payload.update({ data: { titulo } })`)
 * carries no `arquivosModelo` at all, so reading `data` alone would derive from nothing and
 * wipe the formats of a model whose files were never touched. The stored document is the
 * fallback — the same shape `sameTenant` needed for the same reason.
 */

/** The two media collections a model's files can live in. `.zip` is a document-group file. */
export const MODELO_FILE_TARGETS = ['midiaModelo3d', 'midiaDocumento'] as const

/** The relationship the formats are read from. */
const FILE_FIELD = 'arquivosModelo'

/** The derived field itself. */
const DERIVED_FIELD = 'formatos'

/** The slice of the choke-point client this needs: one read, and nothing that can write. */
export type MediaLookup = Pick<TenantScopedPayload, 'find'>

export type FormatosDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests. */
  getStore?: (req: PayloadRequest) => Promise<MediaLookup>
}

/**
 * The `beforeChange` arguments this hook reads. Payload passes a superset; naming only these
 * three keeps the function callable from a unit test without fabricating a whole operation,
 * and `modelo3d.test.ts` pins the assignability to `CollectionBeforeChangeHook`.
 */
export type FormatosWrite = {
  data: Record<string, unknown>
  /** `undefined` on create. On update it is the stored document, at `depth: 0`. */
  originalDoc?: Record<string, unknown>
  req: PayloadRequest
}

/** What the scoped client returns for an upload at `depth: 0`, as far as this cares. */
type StoredUpload = { filename?: unknown }

/** Ids to fetch, grouped by the collection that holds them — one query per collection. */
const idsByCollection = (value: unknown): Map<string, (string | number)[]> => {
  const grouped = new Map<string, (string | number)[]>()
  for (const ref of normalizeRefs(value, [...MODELO_FILE_TARGETS])) {
    grouped.set(ref.relationTo, [...(grouped.get(ref.relationTo) ?? []), ref.id])
  }
  return grouped
}

/**
 * `.stl` from `Bolsa.STL`. Lowercased, because the filter renders the distinct values and an
 * uppercase duplicate would show up as a second entry for the same format.
 */
const extensionOf = (upload: StoredUpload): string =>
  typeof upload.filename === 'string' ? extname(upload.filename).toLowerCase() : ''

/**
 * @example
 * // In the `modelo3d` collection:
 * hooks: { beforeChange: [stampApproval, deriveFormatos] }
 */
export const deriveFormatos = async (
  { data, originalDoc, req }: FormatosWrite,
  deps: FormatosDeps = {},
): Promise<Record<string, unknown>> => {
  const attached = FILE_FIELD in data ? data[FILE_FIELD] : originalDoc?.[FILE_FIELD]
  const grouped = idsByCollection(attached)
  if (grouped.size === 0) return { ...data, [DERIVED_FIELD]: [] }

  const store = await (deps.getStore ?? getTenantScopedPayload)(req)

  const formatos = new Set<string>()
  for (const [collection, ids] of grouped) {
    // `limit` is stated: Payload's `find` defaults to ten documents per page, and the
    // eleventh file of a model would otherwise be dropped silently — `formatos` still holds
    // plausible values, just not all of them.
    const { docs } = await store.find<StoredUpload>({
      collection,
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 0,
    })
    // A reference the scoped client does not return is another organization's upload, or one
    // deleted underneath the write. Nothing is invented for it: `sameTenant` refuses that
    // write one stage later, with the message that names the field rather than the neighbour.
    for (const doc of docs) {
      const extension = extensionOf(doc)
      if (extension) formatos.add(extension)
    }
  }

  // Sorted, so two models with the same files store the same list and the filter's order is
  // stable rather than an artefact of upload order.
  return { ...data, [DERIVED_FIELD]: [...formatos].sort() }
}
