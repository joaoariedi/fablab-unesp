import type { SanitizedCollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise, { s3StorageOptions } from '../../payload.config'
import { isScoped, SCOPE_REGISTRY } from '../../lib/tenancy/scope-registry'
import {
  ALLOWED_EXTENSIONS,
  MEDIA_GROUPS,
  UPLOAD_CAP_BYTES,
  type MediaGroup,
} from '../../lib/uploads/limits'
import { DERIVATIVE_WIDTHS } from '../../lib/uploads/verify'

/**
 * T023b / FR-011, FR-012 — the upload collections decision D1 requires.
 *
 * With `clientUploads` off, the bytes pass through Node, which means Payload's own upload
 * machinery is live again: `checkFileRestrictions` runs, `imageSizes` runs, and the storage
 * adapter writes what Payload has already validated. None of that has a subject until an
 * upload-enabled collection exists — `upload: true` is a *collection* option, and there was
 * no collection carrying it.
 *
 * **One collection per media group, not one media collection.** FR-011 declares three
 * allowlists and FR-012 three caps, and every knob Payload offers for either
 * (`upload.mimeTypes`, and the size guard below) is per collection. A single `midia`
 * collection could only carry the *union* of the three allowlists, which is a cover image
 * field that accepts a 200 MB archive — the exact defect FR-012 was written against.
 *
 * The matrix is generated from `MEDIA_GROUPS`, so a fourth group fails here until it has a
 * collection, rather than silently having none.
 *
 * Config-shape only, no database: this reads the sanitized config and calls the collection's
 * own hooks the way Payload calls them.
 */

/**
 * The slug each group's collection must carry. Written here rather than imported so this
 * file states the contract instead of agreeing with whatever the implementation chose.
 */
const SLUG: Readonly<Record<MediaGroup, string>> = {
  image: 'midiaImagem',
  model3d: 'midiaModelo3d',
  document: 'midiaDocumento',
}

const collectionFor = async (group: MediaGroup): Promise<SanitizedCollectionConfig> => {
  const config = await configPromise
  const collection = config.collections.find((c) => c.slug === SLUG[group])
  if (!collection) {
    throw new Error(
      `No collection "${SLUG[group]}" in the Payload config. D1 turned clientUploads off, ` +
        'so the native upload path needs one upload collection per media group (T023b).',
    )
  }
  return collection
}

/** A file exactly as Payload puts it on the request: name, byte size, sniffed mimetype. */
const fileNamed = (name: string, size: number) => ({
  name,
  size,
  mimetype: 'application/octet-stream',
  data: Buffer.alloc(0),
})

/**
 * Runs every `beforeOperation` hook the collection declares, the way Payload runs them, and
 * reports the refusal message — or `null` when the upload was allowed through.
 *
 * `beforeOperation` is the right seam and it is measured, not guessed: `create.js` runs those
 * hooks at line 35 and only reaches `generateFileData` at line 79, so a refusal here happens
 * before Payload has written a byte to storage or a row to Postgres.
 */
const refusalFor = async (
  collection: SanitizedCollectionConfig,
  file: ReturnType<typeof fileNamed>,
): Promise<null | string> => {
  const req = { file } as never
  for (const hook of collection.hooks?.beforeOperation ?? []) {
    try {
      await hook({ args: { collection, data: {}, req }, collection, context: {}, operation: 'create', req } as never)
    } catch (error) {
      return (error as Error).message
    }
  }
  return null
}

describe.each(MEDIA_GROUPS)('media collection for group "%s" (T023b)', (group) => {
  const cap = UPLOAD_CAP_BYTES[group]
  const allowed = ALLOWED_EXTENSIONS[group]

  it('exists and is upload-enabled, so Payload owns the upload path', async () => {
    const collection = await collectionFor(group)
    expect(
      collection.upload,
      `${SLUG[group]} declares no upload config: with clientUploads off there is no other ` +
        'way for a file to reach storage (D1).',
    ).toBeTruthy()
  })

  it('declares a mimeTypes allowlist, which is what makes Payload sniff the bytes', async () => {
    // `checkFileRestrictions` only reaches `fileTypeFromBuffer` when `mimeTypes` is non-empty
    // (measured in payload/dist/uploads/checkFileRestrictions.js): with the option absent it
    // falls back to a blocklist of executables and never looks at the leading bytes at all.
    const upload = (await collectionFor(group)).upload as { mimeTypes?: string[] }
    expect(Array.isArray(upload.mimeTypes) && upload.mimeTypes.length > 0).toBe(true)
  })

  it.each([...allowed])('accepts %s, the extension FR-011 enumerates for this group', async (ext) => {
    const collection = await collectionFor(group)
    expect(await refusalFor(collection, fileNamed(`arquivo${ext}`, 1))).toBeNull()
  })

  it('refuses an extension outside its own group allowlist (FR-011)', async () => {
    const collection = await collectionFor(group)
    const refusal = await refusalFor(collection, fileNamed('carga.exe', 1))

    expect(refusal, `${SLUG[group]} accepted carga.exe`).not.toBeNull()
    expect(refusal).toContain('.exe')
  })

  /**
   * The case above is satisfied by ANY allowlist that excludes `.exe` — including the union of
   * all three groups. So on its own it asserts nothing about FR-011's per-group *separation*,
   * which is the whole reason there are three collections rather than one: an image field must
   * not accept a 100 MB mesh, and a mesh field must not accept a document.
   *
   * Extensions in more than one group (`.svg` is in both `image` and `document`) are skipped
   * rather than treated as a violation — they are shared by declaration in `limits.ts`.
   */
  const foreignExtensions = MEDIA_GROUPS.filter((other) => other !== group)
    .flatMap((other) => [...ALLOWED_EXTENSIONS[other]])
    .filter((ext) => !allowed.includes(ext))

  it.each(foreignExtensions)('refuses %s, which belongs to another group (FR-011)', async (ext) => {
    const collection = await collectionFor(group)
    const refusal = await refusalFor(collection, fileNamed(`arquivo${ext}`, 1))
    expect(
      refusal,
      `${SLUG[group]} accepted ${ext}, which FR-011 assigns to a different group. A single ` +
        'union allowlist would pass every other assertion in this file and still be wrong.',
    ).not.toBeNull()
  })

  it('accepts a file exactly at its cap and refuses one byte more (FR-012)', async () => {
    const collection = await collectionFor(group)
    const name = `arquivo${allowed[0]}`

    expect(await refusalFor(collection, fileNamed(name, cap))).toBeNull()

    const refusal = await refusalFor(collection, fileNamed(name, cap + 1))
    expect(refusal, `${SLUG[group]} accepted a file over its ${cap}-byte cap`).not.toBeNull()
    // The number must be the constant, not a literal retyped at the collection: a message
    // quoting a different number is a second limit that disagrees with UPLOAD_CAP_BYTES.
    expect(refusal).toContain(String(cap))
  })

  it('is registered scoped, with a justification and the injected tenant field', async () => {
    const entry = (SCOPE_REGISTRY as Record<string, { scope: string; why: string } | undefined>)[
      SLUG[group]
    ]

    expect(entry, `${SLUG[group]} is missing from SCOPE_REGISTRY (FR-004)`).toBeDefined()
    expect(entry?.scope, 'uploaded media belongs to the lab that uploaded it').toBe('scoped')
    expect(entry?.why.trim().length, `${SLUG[group]} has an empty 'why'`).toBeGreaterThan(0)
    expect(isScoped(SLUG[group])).toBe(true)

    const collection = await collectionFor(group)
    expect(
      collection.flattenedFields.some((f) => f.name === 'tenant'),
      `${SLUG[group]} is declared scoped but the multi-tenant plugin never scoped it — add it ` +
        "to the plugin's `collections` map in payload.config.ts.",
    ).toBe(true)
  })

  it('is routed to object storage rather than to the local disk', async () => {
    // Derived from the collections themselves in `s3StorageOptions`; an upload collection
    // missing from that map writes files into the app directory instead of the bucket.
    const config = await configPromise
    const map = s3StorageOptions(
      { S3_ENDPOINT: undefined, S3_BUCKET: 'b', S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined, S3_REGION: 'r' },
      config.collections,
    ).collections as Record<string, boolean>

    expect(map[SLUG[group]]).toBe(true)
  })
})

describe('caps are per collection, not one global number (FR-012)', () => {
  it('refuses a 20 MB image while accepting a 20 MB mesh', async () => {
    const twentyMB = 20 * 1024 * 1024
    const image = await collectionFor('image')
    const mesh = await collectionFor('model3d')

    expect(await refusalFor(image, fileNamed('capa.png', twentyMB))).not.toBeNull()
    expect(await refusalFor(mesh, fileNamed('peca.stl', twentyMB))).toBeNull()
  })
})

describe('image derivatives (FR-011, T019)', () => {
  it('declares one imageSize per DERIVATIVE_WIDTHS entry on the image collection', async () => {
    const upload = (await collectionFor('image')).upload as {
      imageSizes?: { name: string; width?: number }[]
    }
    const declared = Object.fromEntries((upload.imageSizes ?? []).map((s) => [s.name, s.width]))

    expect(declared).toMatchObject(DERIVATIVE_WIDTHS)
  })

  it('declares none for meshes and documents — there is no raster to resize', async () => {
    for (const group of ['model3d', 'document'] as const) {
      const upload = (await collectionFor(group)).upload as { imageSizes?: unknown[] }
      expect(upload.imageSizes ?? [], `${SLUG[group]} declares imageSizes`).toHaveLength(0)
    }
  })
})
