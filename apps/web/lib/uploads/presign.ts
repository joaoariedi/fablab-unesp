/**
 * Presigned upload authorisation — **the size cap is applied here, and it travels on the
 * signed URL** (FR-012, SC-007).
 *
 * With `clientUploads` the browser PUTs straight to the bucket and Node never sees the bytes
 * (spike S1), so this module is the last point at which an oversized upload costs nothing.
 * The URL it returns *is* the authorisation: hand one out for 10 GB and the disk the cap
 * existed to protect has already been spent by the time anything looks at the object.
 * `tech-stack.md` names disk exhaustion as failure number one.
 *
 * Two enforcement points, and both are needed:
 *
 *  1. **Refuse before signing.** No URL is issued for a request that is over the cap, so
 *     there is nothing to replay. Nothing is written, nothing is reaped.
 *  2. **Sign `content-length`.** Point 1 alone would trust a number the *client* declared:
 *     declare 1 MB, collect a valid URL, PUT 10 GB through it. Naming `content-length` as a
 *     signed header makes the declared size part of the signature, so storage itself refuses
 *     a body of any other length. This is the half that survives a lying client.
 *
 * Payload's own presign handler does not do this for us. Read at
 * `@payloadcms/storage-s3/dist/generateSignedURL.js` (3.88.0): it adds `content-length` to
 * `signableHeaders` **only** when a global `upload.limits.fileSize` is configured, and it
 * clamps with `Math.min(filesize, limit)` rather than refusing. Our caps are per group and
 * there is no global one, so on that path the set is empty and the URL carries no size policy
 * at all.
 *
 * The signer is **injected** rather than imported: this module owns the policy, not the AWS
 * SDK, and a policy that can only be exercised by signing against a live bucket is a policy
 * nobody tests. `UploadUrlSigner` is the whole surface it needs.
 */

import { UPLOAD_CAP_BYTES, type MediaGroup } from './limits'

/**
 * Ten minutes, matching what `@payloadcms/storage-s3` uses on its own presign path. A signed
 * URL is a bearer token for one write: the cap on it is only as good as the window in which
 * it can be replayed, and an abandoned one leaves an object for the orphan reaper (T020).
 */
const SIGNED_URL_TTL_SECONDS = 600

/**
 * SigV4 header names are compared lowercase; `Content-Length` in this set does not match and
 * the header silently stops being signed — which looks identical to a working presign until
 * someone uploads a file bigger than they declared.
 */
const SIGNED_SIZE_HEADER = 'content-length'

/** The declared size exceeded its group's cap. Refused before any URL was signed. */
export class UploadTooLargeError extends Error {
  readonly group: MediaGroup
  readonly declaredBytes: number
  readonly capBytes: number

  constructor(group: MediaGroup, declaredBytes: number, capBytes: number) {
    super(
      `Upload recusado: ${declaredBytes} bytes excede o limite de ${capBytes} bytes ` +
        `para arquivos do grupo "${group}".`,
    )
    this.name = 'UploadTooLargeError'
    this.group = group
    this.declaredBytes = declaredBytes
    this.capBytes = capBytes
  }
}

/**
 * The client declared something that is not a byte count.
 *
 * `NaN` is why this is a hard refusal and not a coercion: `NaN > cap` is `false`, so a module
 * that only compares against the cap *accepts* it and signs a URL whose `Content-Length` is
 * `NaN` — an uncapped write, arrived at by the check that was supposed to prevent one.
 */
export class InvalidDeclaredSizeError extends Error {
  readonly group: MediaGroup

  constructor(group: MediaGroup, declared: unknown) {
    super(
      `Upload recusado: o tamanho declarado (${String(declared)}) para o grupo "${group}" ` +
        'não é um número inteiro de bytes maior que zero.',
    )
    this.name = 'InvalidDeclaredSizeError'
    this.group = group
  }
}

/**
 * The request named a group that has no cap. Refused rather than defaulted: the group arrives
 * from the client, an unknown one looks up to `undefined`, and comparing against `undefined`
 * is always `false` — so trusting the lookup does not mis-cap the upload, it uncaps it.
 */
export class UnknownMediaGroupError extends Error {
  constructor(group: string) {
    super(
      `Upload recusado: "${group}" não é um grupo de mídia conhecido, portanto não tem ` +
        `limite de tamanho. Grupos válidos: ${Object.keys(UPLOAD_CAP_BYTES).join(', ')}.`,
    )
    this.name = 'UnknownMediaGroupError'
  }
}

/** Exactly what the signer needs, so this module never imports an S3 client. */
export type SignedUploadParams = {
  readonly key: string
  readonly contentLength: number
  readonly contentType: string | undefined
  /** Headers folded into the signature. Must contain `content-length` (see module docstring). */
  readonly signableHeaders: ReadonlySet<string>
  readonly expiresIn: number
}

export type PresignRequest = {
  readonly group: MediaGroup
  /** Generated upstream (T017) and passed through untouched — never attacker-chosen. */
  readonly key: string
  readonly declaredBytes: number
  readonly contentType?: string
}

export type PresignedUpload = {
  readonly url: string
  readonly key: string
  /** The cap this URL was issued under, for the client to enforce before it starts sending. */
  readonly maxBytes: number
  /** Headers the client MUST send verbatim; anything else fails the signature check. */
  readonly requiredHeaders: Readonly<Record<string, string>>
  readonly expiresIn: number
}

/** The presigner, as this module needs it. Injected so the policy is testable without a bucket. */
export interface UploadUrlSigner {
  sign(params: SignedUploadParams): Promise<string>
}

/** The group's cap, or a refusal — never `undefined` flowing into a comparison. */
function capFor(group: MediaGroup): number {
  const caps: Readonly<Record<string, number | undefined>> = UPLOAD_CAP_BYTES
  const cap = caps[group]
  if (typeof cap !== 'number') throw new UnknownMediaGroupError(String(group))
  return cap
}

/** A whole number of bytes greater than zero — rejecting NaN, Infinity, fractions and 0. */
function isByteCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/**
 * Authorises one direct-to-storage upload, or refuses it. Throws before reaching the signer
 * whenever the request cannot be capped, so a refused upload leaves no URL behind.
 *
 * @example
 * const { url, requiredHeaders } = await presignUpload(
 *   { group: 'image', key: 'quarantine/img/01J....jpg', declaredBytes: file.size },
 *   s3Signer,
 * )
 */
export async function presignUpload(
  request: PresignRequest,
  signer: UploadUrlSigner,
): Promise<PresignedUpload> {
  const { group, key, declaredBytes, contentType } = request
  const capBytes = capFor(group)

  if (!isByteCount(declaredBytes)) throw new InvalidDeclaredSizeError(group, declaredBytes)
  if (declaredBytes > capBytes) throw new UploadTooLargeError(group, declaredBytes, capBytes)

  const url = await signer.sign({
    key,
    // The declared size exactly, never clamped up to the cap: the signature must authorise
    // the body the client said it would send and no more.
    contentLength: declaredBytes,
    contentType,
    signableHeaders: new Set([SIGNED_SIZE_HEADER]),
    expiresIn: SIGNED_URL_TTL_SECONDS,
  })

  return {
    url,
    key,
    maxBytes: capBytes,
    requiredHeaders: { 'Content-Length': String(declaredBytes) },
    expiresIn: SIGNED_URL_TTL_SECONDS,
  }
}
