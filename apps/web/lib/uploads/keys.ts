/**
 * Object keys are **generated here, from nothing the client sent** (FR-013, SC-008).
 *
 * With `clientUploads` the browser PUTs straight to the bucket against a presigned URL
 * (spike S1), so the key is not a naming convention — it *is* the write location, signed and
 * handed to the uploader. Derive it from `file.name` and `../../etc/passwd` becomes an
 * authorisation to write outside `quarantine/`: past the one prefix the stack refuses to
 * serve (T005, `infra/minio-init.sh`) and past the post-upload signature check that is the
 * only defence on this path (plan § Sketch 4).
 *
 * **Generated, not sanitised**, and the distinction is the whole design. A sanitiser is a
 * blocklist wearing a different hat — it has to anticipate `..`, `..\`, `%2e%2e%2f`, a
 * NUL-truncated name, a trailing dot, whatever the next decoder in the chain unescapes — and
 * it fails open every time one is missed. A generated key has no such surface: the filename
 * contributes no bytes to it, so there is nothing to escape. FR-013 says the original name is
 * *metadata*, and this module is where that becomes true rather than aspirational.
 *
 * The single exception is the extension, and it is bounded: a suffix is echoed **only** when
 * the declared group's own allowlist (FR-011, `limits.ts`) contains it, lowercased. So
 * `a.png.svg` may contribute `.svg` and can never contribute `a.png`, and an extension off
 * the list contributes nothing at all — the key simply has none. It is a lookup into a frozen
 * table, not a transformation of attacker input.
 *
 * The identifier is `randomUUID()` and is **not injectable**. An injected generator is one
 * more parameter a caller can thread client data into, which is exactly the property this
 * module exists to remove; the tests assert the key's *shape* and its uniqueness instead, and
 * neither needs determinism to be checkable.
 */

import { randomUUID } from 'node:crypto'

import { ALLOWED_EXTENSIONS, MEDIA_GROUPS, type MediaGroup } from './limits'

/**
 * The prefix every upload lands under, before anything has looked at its bytes.
 *
 * Provisioned and verified private by `infra/minio-init.sh`, declared beside `S3_BUCKET` in
 * `infra/docker-compose.yml`, and asserted equal to that declaration in
 * `tests/uploads/keys.test.ts` — a rename on one side and not the other would write
 * unverified objects into a location nobody made private.
 */
export const QUARANTINE_PREFIX = 'quarantine'

/**
 * The group named no key namespace, so no key was generated.
 *
 * Refused rather than defaulted or interpolated: the group arrives from the client alongside
 * the filename. Writing an unrecognised one into the path hands back the very segment this
 * module takes away — `group: '../public'` would place the object one directory up from the
 * quarantine, which is the traversal arriving through the other parameter.
 */
export class UnroutableMediaGroupError extends Error {
  readonly group: string

  constructor(group: string) {
    super(
      `Upload recusado: "${group}" não é um grupo de mídia conhecido, portanto não existe ` +
        `prefixo de armazenamento para ele. Grupos válidos: ${MEDIA_GROUPS.join(', ')}.`,
    )
    this.name = 'UnroutableMediaGroupError'
    this.group = group
  }
}

/**
 * The original filename was not a string.
 *
 * A hard refusal because the alternatives are worse: `String(undefined)` would put the word
 * "undefined" through the extension lookup and silently store a nameless object, and reading
 * `.length` off `null` throws somewhere further down the stack, where the message no longer
 * names the upload that caused it.
 */
export class InvalidOriginalFilenameError extends Error {
  constructor(originalFilename: unknown) {
    super(
      `Upload recusado: o nome de arquivo original (${String(originalFilename)}) precisa ser ` +
        'uma string; ele é armazenado apenas como metadado.',
    )
    this.name = 'InvalidOriginalFilenameError'
  }
}

export type ObjectKeyRequest = {
  /** Declared by the field, checked here — decides the namespace, never the rest of the key. */
  readonly group: MediaGroup
  /** Whatever the browser sent. Metadata only: it contributes no bytes to the key. */
  readonly originalFilename: string
}

export type GeneratedObjectKey = {
  /** Where the object is written. Generated; safe to sign and to interpolate into a path. */
  readonly key: string
  /** The client's name, preserved verbatim for display — changing it would misreport the upload. */
  readonly originalFilename: string
  /** The extension echoed into the key, or `''` when the group's allowlist did not contain it. */
  readonly extension: string
}

/** A trailing `.` plus alphanumerics — the only shape any allowlisted extension has. */
const TRAILING_EXTENSION = /\.[A-Za-z0-9]+$/

/** The declared group, or a refusal — never an unknown string flowing into the path. */
function namespaceFor(group: MediaGroup): MediaGroup {
  const groups: readonly string[] = MEDIA_GROUPS
  if (!groups.includes(group)) throw new UnroutableMediaGroupError(String(group))
  return group
}

/**
 * The last extension of `originalFilename` when the group allows it, lowercased; otherwise
 * `''`.
 *
 * Membership of a frozen table is the whole test — that is what keeps this a lookup rather
 * than a sanitisation. `a.png.svg` resolves to `.svg` because only the final suffix is ever
 * considered, so the double extension collapses to the one the allowlist recognises.
 */
function allowedExtension(group: MediaGroup, originalFilename: string): string {
  const extension = TRAILING_EXTENSION.exec(originalFilename)?.[0].toLowerCase()
  if (extension === undefined) return ''
  return ALLOWED_EXTENSIONS[group].includes(extension) ? extension : ''
}

/**
 * Generates the object key for one upload and returns the original filename beside it, as
 * metadata (FR-013).
 *
 * Throws before producing anything when the group is unknown or the filename is not a string,
 * so no caller ever signs a URL for a key that was not fully generated here.
 *
 * @example
 * const { key, originalFilename } = generateObjectKey({ group: 'image', originalFilename: file.name })
 * // key === 'quarantine/image/6f1cbb4e-9e2a-4d0f-8a3e-1c2b7d5a9f10.png'
 * // file.name is stored beside it, never routed into it
 * const upload = await presignUpload({ group: 'image', key, declaredBytes: file.size }, signer)
 */
export function generateObjectKey(request: ObjectKeyRequest): GeneratedObjectKey {
  const { group, originalFilename } = request

  if (typeof originalFilename !== 'string') {
    throw new InvalidOriginalFilenameError(originalFilename)
  }

  const namespace = namespaceFor(group)
  const extension = allowedExtension(namespace, originalFilename)

  return {
    key: `${QUARANTINE_PREFIX}/${namespace}/${randomUUID()}${extension}`,
    originalFilename,
    extension,
  }
}
