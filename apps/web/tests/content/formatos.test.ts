import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { deriveFormatos } from '../../collections/content/formatos'
import type { FindArgs } from '../../lib/tenancy'
// `PaginatedResult` is not on the module's public surface — the fake below has to return the
// exact shape the choke point does, so it is imported from where it is declared.
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T039 / FR-020 — `formatos`, the one derived value of this feature that is not a counter.
 *
 * `data-model.md` § Derived values states the rule in one line: *the extensions of
 * `arquivosModelo`, computed on save*. `lib/content/counters.ts` says in its own docstring
 * why it is not a counter and does not live there — it is derived from the very document
 * being written rather than counted across rows — and hands this collection's `beforeChange`
 * the job.
 *
 * The unit half is here, with a named fake for the media library, because what has to be
 * pinned is *how the extensions are obtained*: an id carries no extension, so the derivation
 * has to read the uploaded documents, and every property below is one a plausible
 * implementation gets wrong while still looking right against a happy path.
 *
 * The integration half — that a real save stores what this computes — belongs to the
 * reconciliation gate in `counters.test.ts`, which recounts every FR-020 derived value from
 * its source once `modelo3d` is registered (T044).
 */

/** Uploaded media as the scoped client returns it at `depth: 0`: an id and a filename. */
type StoredUpload = { id: number; filename: string }

/**
 * The media library the derivation reads, as a named fake rather than an inline stub: it
 * records every query so the tests can assert *what was asked*, which is where the two
 * silent defects live (a default page size that drops the eleventh file, and a second query
 * per id instead of one per collection).
 */
class FakeMediaLibrary {
  readonly queries: FindArgs[] = []

  constructor(private readonly shelves: Record<string, StoredUpload[]>) {}

  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    this.queries.push(args)
    const wanted = ((args.where?.id as { in?: unknown[] } | undefined)?.in ?? []).map(String)
    const shelf = this.shelves[args.collection] ?? []
    const found = shelf
      .filter((row) => wanted.includes(String(row.id)))
      .slice(0, args.limit ?? Number.POSITIVE_INFINITY)
    return { docs: found as unknown as T[], totalDocs: found.length }
  }
}

/** The library CITe has uploaded, across the two collections a model's files can live in. */
const library = () =>
  new FakeMediaLibrary({
    midiaModelo3d: [
      { id: 1, filename: 'bolsa-vazada.stl' },
      { id: 2, filename: 'bolsa-suporte.STL' },
      { id: 3, filename: 'bolsa-vazada.3mf' },
      { id: 4, filename: 'preview.glb' },
    ],
    midiaDocumento: [{ id: 9, filename: 'pacote-completo.zip' }],
  })

const req = { headers: new Headers({ host: 'cite.fablab.test' }) } as unknown as PayloadRequest

const mesh = (id: number) => ({ relationTo: 'midiaModelo3d', value: id })
const documento = (id: number) => ({ relationTo: 'midiaDocumento', value: id })

const derive = async (
  write: { data: Record<string, unknown>; originalDoc?: Record<string, unknown> },
  store: FakeMediaLibrary,
): Promise<Record<string, unknown>> =>
  deriveFormatos({ ...write, req }, { getStore: async () => store })

describe('formatos is derived from the uploaded files at save (T039, FR-020)', () => {
  it('stores the distinct extensions of the attached files, sorted', async () => {
    const result = await derive({ data: { arquivosModelo: [mesh(1), mesh(3)] } }, library())

    expect(result.formatos).toEqual(['.3mf', '.stl'])
  })

  it('lowercases the extension, so .STL and .stl are one format in the filter', async () => {
    // The filter `Todos os formatos` renders the distinct values; an uppercase duplicate
    // would show up as a second entry for the same format.
    const result = await derive({ data: { arquivosModelo: [mesh(1), mesh(2)] } }, library())

    expect(result.formatos).toEqual(['.stl'])
  })

  it('spans both media collections in one query each, never one query per file', async () => {
    // `.zip` is on the document group's allowlist and `.stl` on the 3D group's, so a model
    // that ships a mesh and an archive has files in two collections (Media.ts § one
    // collection per group). A query per id is an N+1 on every save of a ten-file model.
    const store = library()

    const result = await derive(
      { data: { arquivosModelo: [mesh(1), mesh(3), documento(9)] } },
      store,
    )

    expect(result.formatos).toEqual(['.3mf', '.stl', '.zip'])
    expect(store.queries).toHaveLength(2)
    expect(store.queries.map((q) => q.collection).sort()).toEqual([
      'midiaDocumento',
      'midiaModelo3d',
    ])
  })

  it('asks for every attached file, not the first page of them', async () => {
    // Payload's `find` defaults to ten documents per page. A model with eleven files would
    // silently lose the eleventh format — and the loss is invisible: `formatos` still holds
    // plausible values, just not all of them.
    const store = library()

    await derive({ data: { arquivosModelo: [mesh(1), mesh(3), mesh(4)] } }, store)

    const query = store.queries.find((q) => q.collection === 'midiaModelo3d')
    expect(query?.limit, 'the derivation accepted the default page size').toBeGreaterThanOrEqual(3)
  })

  it('recomputes from the stored files when a save does not carry arquivosModelo', async () => {
    // A partial update — `payload.update({ data: { titulo } })` — sends only the changed
    // field. Reading `data` alone would derive from nothing and wipe the formats of a model
    // whose files were never touched.
    const result = await derive(
      { data: { titulo: 'BOLSA VAZADA' }, originalDoc: { arquivosModelo: [mesh(1)] } },
      library(),
    )

    expect(result.formatos).toEqual(['.stl'])
    expect(result.titulo, 'the rest of the write must survive the derivation').toBe('BOLSA VAZADA')
  })

  it('overwrites a formatos the request supplied: it is derived, never accepted', async () => {
    // `admin.readOnly` greys the input and stops nothing coming through the API, which is the
    // lesson CLR-001 recorded on the approval stamp. The derivation owning the field is what
    // makes the filter's values match the files.
    const result = await derive(
      { data: { arquivosModelo: [mesh(1)], formatos: ['.exe', '.dwg'] } },
      library(),
    )

    expect(result.formatos).toEqual(['.stl'])
  })

  it('empties formatos when the files are removed, rather than leaving them stale', async () => {
    const result = await derive(
      { data: { arquivosModelo: [] }, originalDoc: { arquivosModelo: [mesh(1)] } },
      library(),
    )

    expect(result.formatos).toEqual([])
  })

  it('ignores a reference the scoped client does not return', async () => {
    // Another organization's upload, or one deleted underneath the write: the scoped client
    // matches no row. `sameTenant` is what refuses that write, one stage later and with the
    // better message; the derivation must not invent an extension for it.
    const result = await derive({ data: { arquivosModelo: [mesh(1), mesh(77)] } }, library())

    expect(result.formatos).toEqual(['.stl'])
  })

  it('reads through the request\'s own scoped client (FR-024, FR-013)', async () => {
    // The choke point is reached with the caller's `req` — the same discipline
    // `lib/content/counters.ts` documents: a fresh request would leave the transaction the
    // save is running in, and `req.payload` would read every organization's uploads.
    const seen: PayloadRequest[] = []
    const store = library()

    await deriveFormatos(
      { data: { arquivosModelo: [mesh(1)] }, req },
      {
        getStore: async (incoming) => {
          seen.push(incoming)
          return store
        },
      },
    )

    expect(seen).toEqual([req])
  })

  it('is assignable as a Payload beforeChange hook', () => {
    // The hook takes an optional second argument for injection, which must not break the
    // signature Payload calls it with — a hook that cannot be registered derives nothing.
    const registered: CollectionBeforeChangeHook = deriveFormatos

    expect(registered).toBe(deriveFormatos)
  })
})
