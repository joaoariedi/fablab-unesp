import { extname } from 'node:path'

import type { CollectionBeforeOperationHook, CollectionConfig, ImageSize } from 'payload'
import { APIError } from 'payload'

import { scopedAccess, teamOnly } from '../lib/tenancy/access'
import { scopedListEndpoint } from '../lib/tenancy/scoped-endpoint'
import {
  ALLOWED_EXTENSIONS,
  MEDIA_GROUPS,
  UPLOAD_CAP_BYTES,
  type MediaGroup,
} from '../lib/uploads/limits'
import { DERIVATIVE_WIDTHS } from '../lib/uploads/verify'

/**
 * The upload collections decision D1 made necessary (T023b, FR-011, FR-012).
 *
 * **Why this file exists at all.** With `clientUploads` on, the browser PUT straight to the
 * bucket and Payload never saw the bytes — spike S1 measured `generateFileData` returning at
 * `if (!file)` before `checkFileRestrictions` and before `imageSizes`, which made every
 * per-field rule the framework offers inert. D1 turned that off, so the bytes now pass
 * through Node and all of that machinery is live again. But it is *collection* machinery:
 * `upload` is a collection option, and the app had no collection carrying it. This is it.
 *
 * **One collection per media group, not one `midia` collection.** Every knob Payload gives
 * for FR-011 and FR-012 — `upload.mimeTypes`, and the size guard below — is per collection.
 * A single collection could only carry the *union* of the three allowlists and the largest
 * of the three caps, which is a cover-image field that accepts a 200 MB archive: exactly the
 * defect FR-012 was written against. Three collections is what makes the group the unit of
 * policy, and a field that points at `midiaImagem` inherits the image rules by construction.
 *
 * **Payload has no per-collection `filesize`, and that was verified rather than assumed.**
 * `UploadConfig` in payload 3.88 declares `mimeTypes` and `imageSizes` but no size option at
 * all; the only size number the framework reads is `config.upload.limits.fileSize`, which is
 * global (it is `MAX_UPLOAD_CAP_BYTES`, the ceiling, in `payload.config.ts`). So the per-group
 * cap FR-012 requires is enforced by `refuseOffPolicyUpload` below — ours, but running inside
 * Payload's own operation, before a byte reaches storage.
 *
 * **The extension allowlist is ours too, and it is not redundant with `mimeTypes`.** Payload
 * compares the *sniffed* type against `mimeTypes`, and when nothing can be sniffed it falls
 * back to `getFileTypeFallback`, whose table knows ten extensions and answers `text/plain`
 * for everything else — `.stl`, `.obj`, `.gltf` and `.dxf` included. Allowing `text/plain`
 * (which the 3D and document groups must, or every ASCII mesh is refused) therefore allows
 * *any* unsniffable file through that check. The extension gate is what closes it: the two
 * together admit a `.stl` whose bytes are unrecognisable, and refuse a `.php` whose bytes are
 * equally unrecognisable. Neither layer is FR-011 on its own.
 */

/** The collection slug for each group. PT-BR, camelCase, like every other content slug. */
export const MEDIA_SLUGS: Readonly<Record<MediaGroup, string>> = Object.freeze({
  image: 'midiaImagem',
  model3d: 'midiaModelo3d',
  document: 'midiaDocumento',
})

const LABELS: Readonly<Record<MediaGroup, { singular: string; plural: string }>> = Object.freeze({
  image: { singular: 'Imagem', plural: 'Imagens' },
  model3d: { singular: 'Modelo 3D', plural: 'Modelos 3D' },
  document: { singular: 'Documento', plural: 'Documentos' },
})

/**
 * What Payload is allowed to sniff for each group.
 *
 * Every entry is the type `file-type` actually reports for that container, not the type the
 * extension suggests, because `checkFileRestrictions` compares the *detected* mime:
 *
 *  - `.3mf` is a ZIP container, so it is detected as `application/zip` — listing only
 *    `model/3mf` would refuse every valid 3MF.
 *  - `.stl`, `.obj`, `.gltf` and `.dxf` are text or headerless binary and are detected as
 *    nothing at all, which sends Payload to its extension fallback: `text/plain`. That entry
 *    is wide, and `refuseOffPolicyUpload`'s extension gate is what narrows it again.
 *  - SVG is text too, and Payload has a dedicated path for it (`detectSvgFromXml`, then
 *    `validateSvg` against scripts) that only runs when `image/svg+xml` is listed.
 */
export const ACCEPTED_MIME_TYPES: Readonly<Record<MediaGroup, readonly string[]>> = Object.freeze({
  image: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  model3d: Object.freeze([
    'model/stl',
    'model/3mf',
    'model/obj',
    'model/gltf+json',
    'model/gltf-binary',
    'application/zip',
    'text/plain',
  ]),
  document: Object.freeze([
    'application/pdf',
    'application/zip',
    'image/svg+xml',
    'image/vnd.dxf',
    'text/plain',
  ]),
})

/**
 * The derivatives Payload generates for raster uploads, from the widths named once in
 * `lib/uploads/verify.ts` — `miniatura` for list rows, `card` for the grid cards.
 *
 * Declared **only** on the image collection. There is no raster in an `.stl` or a `.pdf` to
 * resize, and asking sharp for one would be a decode of attacker-supplied bytes that CLR-003
 * refuses for exactly those formats.
 *
 * `withoutEnlargement: true` keeps a source smaller than the target as itself: the default
 * (`undefined`) stores `null` for that size, and a card that silently has no image is harder
 * to notice than one that is a little soft.
 */
const imageSizesFor = (group: MediaGroup): ImageSize[] | undefined =>
  group === 'image'
    ? Object.entries(DERIVATIVE_WIDTHS).map(([name, width]) => ({
        name,
        width,
        withoutEnlargement: true,
      }))
    : undefined

/** Human-readable megabytes for an error message. The bytes are quoted beside it. */
const asMegabytes = (bytes: number): string => `${Math.round(bytes / (1024 * 1024))} MB`

/**
 * Refuses an upload whose extension is off its group's allowlist, or whose size is over its
 * group's cap — **before Payload has written anything** (FR-011, FR-012).
 *
 * `beforeOperation` is the seam, and the ordering is measured rather than hoped for:
 * `collections/operations/create.js` runs these hooks at line 35 and only reaches
 * `generateFileData` — where the storage adapter is invoked — at line 79. A refusal here
 * costs a rejected request; the same refusal one stage later costs a stored object.
 *
 * Both messages carry the offending value *and* the expected shape, because an upload that
 * fails is a message a lab member reads in the admin panel, not a log line.
 *
 * @example
 *   hooks: { beforeOperation: [refuseOffPolicyUpload('image')] }
 */
export const refuseOffPolicyUpload =
  (group: MediaGroup): CollectionBeforeOperationHook =>
  ({ args, req }) => {
    const file = req?.file
    // No file on the request: a metadata-only edit (renaming the alt text of an existing
    // upload). There is nothing to measure, and refusing here would make every such edit fail.
    if (!file) return args

    const extension = extname(file.name).toLowerCase()
    const allowed = ALLOWED_EXTENSIONS[group]
    if (!allowed.includes(extension)) {
      throw new APIError(
        `Upload recusado: "${file.name}" tem extensão "${extension}", que não está na lista ` +
          `de formatos aceitos por ${MEDIA_SLUGS[group]}. Aceitos: ${allowed.join(' ')}.`,
        415,
        null,
        true,
      )
    }

    const cap = UPLOAD_CAP_BYTES[group]
    if (file.size > cap) {
      throw new APIError(
        `Upload recusado: "${file.name}" tem ${file.size} bytes e o limite de ` +
          `${MEDIA_SLUGS[group]} é ${cap} bytes (${asMegabytes(cap)}).`,
        413,
        null,
        true,
      )
    }

    return args
  }

/**
 * One upload collection for one media group.
 *
 * A factory rather than three hand-written files, for the reason `scopedListEndpoint` is one:
 * three copies drift, and the day one of them forgets its cap is the day FR-012 stops holding
 * for that group without anything failing.
 *
 * @example mediaCollection('image').slug // 'midiaImagem'
 */
export function mediaCollection(group: MediaGroup): CollectionConfig {
  const slug = MEDIA_SLUGS[group]

  return {
    slug,
    labels: LABELS[group],
    admin: {
      useAsTitle: 'filename',
      defaultColumns: ['filename', 'mimeType', 'filesize', 'updatedAt'],
      description: `Arquivos enviados por esta organização. Aceita ${ALLOWED_EXTENSIONS[group].join(' ')} ` +
        `até ${asMegabytes(UPLOAD_CAP_BYTES[group])}.`,
      group: 'Mídia',
    },
    // The custom-endpoint surface of the isolation harness (FR-019, CF-9): `isolation.test.ts`
    // throws for a scoped collection that declares no `/mine`, because a surface with no
    // subject asserts nothing.
    endpoints: [scopedListEndpoint(slug)],
    access: {
      // Uploaded media is one lab's, on every surface — a constraint, never a boolean (FR-006).
      read: scopedAccess(),
      // A maker uploads the images of the project they are submitting, exactly as they create
      // the `projeto` itself (T024). The review queue, not the upload, is the gate.
      create: scopedAccess(),
      update: scopedAccess(),
      // Deleting is the team's: an object key is referenced by published content, and a maker
      // who could delete could break another member's published project.
      delete: teamOnly(),
    },
    // **Empty, but never omitted.** Payload tolerates a collection with no `fields`; the
    // multi-tenant plugin does not — `addFilterOptionsToFields` iterates `collection.fields`
    // before sanitization and throws `TypeError: fields is not iterable` at config load, which
    // takes the whole app down rather than just this collection. Measured, not defensive.
    //
    // Nothing of ours belongs here yet: Payload adds `filename`, `mimeType`, `filesize`,
    // `sizes` and the rest, and the tenant plugin adds `tenant`. An `alt` field for images is
    // feature 003's call, when there is a renderer to need it.
    fields: [],
    upload: {
      mimeTypes: [...ACCEPTED_MIME_TYPES[group]],
      imageSizes: imageSizesFor(group),
      // The admin list thumbnail is the derivative, never the original: showing a 10 MB
      // source scaled down in CSS is what the `miniatura` size exists to avoid.
      adminThumbnail: group === 'image' ? 'miniatura' : undefined,
      // A row may exist before its bytes do. Two callers need that and neither is exotic: the
      // isolation harness seeds a row per scoped collection with **no object store present**
      // (CI runs Postgres and no MinIO), and any programmatic creation does the same. A
      // fileless row references no object, so it leaks nothing and serves nothing.
      filesRequiredOnCreate: false,
    },
    hooks: {
      // The per-group cap and the extension allowlist. See `refuseOffPolicyUpload` for why
      // neither can be expressed through `upload` itself in payload 3.88.
      beforeOperation: [refuseOffPolicyUpload(group)],
    },
  }
}

/**
 * Every media collection, derived from `MEDIA_GROUPS` so a fourth group cannot be added to
 * `limits.ts` and quietly have no collection to be uploaded into.
 */
export const MEDIA_COLLECTIONS: CollectionConfig[] = MEDIA_GROUPS.map(mediaCollection)
