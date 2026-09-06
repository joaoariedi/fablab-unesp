import { describe, expect, it } from 'vitest'

import { MEDIA_GROUPS, UPLOAD_CAP_BYTES, type MediaGroup } from '../../lib/uploads/limits'
import {
  InvalidDeclaredSizeError,
  presignUpload,
  UnknownMediaGroupError,
  UploadTooLargeError,
  type SignedUploadParams,
} from '../../lib/uploads/presign'

/**
 * T016 — FR-012 / SC-007: the cap is enforced **at presign**, and it travels on the signed
 * URL.
 *
 * Two distinct claims, and a test that only makes the first is worth very little:
 *
 *  1. **Refused before storage.** An oversized request must not produce a URL at all. With
 *     `clientUploads` the browser PUTs straight to the bucket (spike S1), so the URL *is* the
 *     authorisation — hand one out and the bytes are already the platform's problem. The
 *     `RecordingSigner` below exists to assert the negative: for a refused upload the signer
 *     is never reached, so no URL ever existed to be replayed.
 *  2. **The storage enforces it too.** Our own comparison runs against a number the *client*
 *     declared. If `content-length` is not among the signed headers, a client may declare
 *     1 MB, collect a valid URL and PUT 10 GB through it — the check would be advice, not a
 *     cap. Payload's own `generateSignedURL` adds `content-length` to `signableHeaders` only
 *     when a *global* `upload.limits.fileSize` is configured (read at
 *     `@payloadcms/storage-s3/dist/generateSignedURL.js`, 3.88.0); we have per-group caps and
 *     no global one, so on the default path that set is empty and the URL carries no size
 *     policy whatsoever. That measurement is why this file asserts the signing input and not
 *     just the refusal.
 *
 * The caps themselves are never retyped here — they are read from `UPLOAD_CAP_BYTES` (T015),
 * which `limits.test.ts` in turn pins to `tech-stack.md`. A number copied into this file would
 * agree with the code and with nothing else the day a cap moves.
 */

/**
 * Stands in for the S3 presigner. Records every signing input and answers with a URL shaped
 * like a real one, so "was a URL issued at all?" is an observable fact rather than an
 * inference from a thrown error.
 */
class RecordingSigner {
  readonly signed: SignedUploadParams[] = []

  sign = async (params: SignedUploadParams): Promise<string> => {
    this.signed.push(params)
    return `https://storage.invalid/fablab/${params.key}?X-Amz-Expires=${params.expiresIn}`
  }
}

/** A request that is valid in every respect except what the individual test is varying. */
function request(group: MediaGroup, declaredBytes: number) {
  return {
    group,
    key: `quarantine/${group}/01JGENERATEDKEY.bin`,
    declaredBytes,
    contentType: 'application/octet-stream',
  }
}

describe('the cap is enforced before any URL exists (FR-012, SC-007)', () => {
  it.each(MEDIA_GROUPS)('signs an upload exactly at the %s cap', async (group) => {
    const signer = new RecordingSigner()
    const cap = UPLOAD_CAP_BYTES[group]

    const presigned = await presignUpload(request(group, cap), signer)

    expect(presigned.url).toContain('https://storage.invalid/')
    expect(signer.signed).toHaveLength(1)
    expect(
      presigned.maxBytes,
      'the presign result does not carry the group cap it was issued under',
    ).toBe(cap)
  })

  it.each(MEDIA_GROUPS)('refuses one byte past the %s cap, and signs nothing', async (group) => {
    const signer = new RecordingSigner()
    const cap = UPLOAD_CAP_BYTES[group]

    await expect(presignUpload(request(group, cap + 1), signer)).rejects.toBeInstanceOf(
      UploadTooLargeError,
    )
    expect(
      signer.signed,
      'a URL was signed for an oversized upload. SC-007 says "refused before storage": once ' +
        'the URL exists the browser can PUT the bytes straight to the bucket and the disk ' +
        'cost the cap existed to prevent has already been paid.',
    ).toHaveLength(0)
  })

  it('names the cap, the declared size and the group, so the refusal is actionable', async () => {
    const signer = new RecordingSigner()
    const cap = UPLOAD_CAP_BYTES.image

    const refusal = await presignUpload(request('image', cap * 3), signer).then(
      () => null,
      (error: unknown) => error as Error,
    )

    expect(refusal, 'the oversized presign resolved instead of refusing').not.toBeNull()
    expect(refusal?.message).toContain(String(cap))
    expect(refusal?.message).toContain(String(cap * 3))
    expect(refusal?.message).toContain('image')
  })

  it('applies each group its own cap, not the largest one', async () => {
    const signer = new RecordingSigner()
    // An image the size of the document cap: accepted only by a module that lost the group.
    await expect(
      presignUpload(request('image', UPLOAD_CAP_BYTES.document), signer),
    ).rejects.toBeInstanceOf(UploadTooLargeError)
    expect(signer.signed).toHaveLength(0)
  })
})

describe('the policy travels on the signed URL, not only through our comparison', () => {
  it('signs the content-length header, so storage rejects a different body', async () => {
    const signer = new RecordingSigner()

    await presignUpload(request('image', 4096), signer)

    const [params] = signer.signed
    expect(params).toBeDefined()
    expect(
      [...(params?.signableHeaders ?? [])],
      'content-length is not signed, so the cap is enforced only by our own check against a ' +
        'number the client supplied — declare 1 MB, upload 10 GB.',
    ).toContain('content-length')
  })

  it('signs the declared length exactly, never clamped up to the cap', async () => {
    const signer = new RecordingSigner()

    await presignUpload(request('model3d', 5_000), signer)

    expect(
      signer.signed[0]?.contentLength,
      'the signed content-length is not the declared size. Clamping to the cap would sign a ' +
        'URL that authorises far more bytes than the client asked to send.',
    ).toBe(5_000)
    expect(signer.signed[0]?.contentLength).not.toBe(UPLOAD_CAP_BYTES.model3d)
  })

  it('tells the client which headers it must send, or the signature will not match', async () => {
    const signer = new RecordingSigner()

    const presigned = await presignUpload(request('document', 7_777), signer)

    expect(presigned.requiredHeaders['Content-Length']).toBe('7777')
  })

  it('expires quickly — a long-lived URL is a cap anyone can reuse', async () => {
    const signer = new RecordingSigner()

    const presigned = await presignUpload(request('image', 1_024), signer)

    expect(presigned.expiresIn).toBeGreaterThan(0)
    expect(presigned.expiresIn).toBeLessThanOrEqual(600)
    expect(signer.signed[0]?.expiresIn).toBe(presigned.expiresIn)
  })

  it('passes the generated key through untouched (T017 owns the key, not this module)', async () => {
    const signer = new RecordingSigner()
    const req = request('image', 2_048)

    const presigned = await presignUpload(req, signer)

    expect(presigned.key).toBe(req.key)
    expect(signer.signed[0]?.key).toBe(req.key)
  })
})

describe('a declared size that is not a size is refused, never signed', () => {
  // NaN is the dangerous one and the reason this block exists: `NaN > cap` is false, so a
  // module that only compares against the cap *accepts* it and signs a URL with
  // `ContentLength: NaN`. Infinity is its mirror image on the other paths.
  const notSizes: readonly [string, number][] = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -1],
    ['zero', 0],
    ['fractional', 1.5],
  ]

  it.each(notSizes)('refuses a %s declared size', async (_label, declaredBytes) => {
    const signer = new RecordingSigner()

    await expect(presignUpload(request('image', declaredBytes), signer)).rejects.toBeInstanceOf(
      InvalidDeclaredSizeError,
    )
    expect(signer.signed).toHaveLength(0)
  })

  it('refuses a missing declared size rather than signing an uncapped URL', async () => {
    const signer = new RecordingSigner()
    const missing = { ...request('image', 0) } as { declaredBytes?: number }
    delete missing.declaredBytes

    await expect(
      presignUpload(missing as Parameters<typeof presignUpload>[0], signer),
    ).rejects.toBeInstanceOf(InvalidDeclaredSizeError)
    expect(signer.signed).toHaveLength(0)
  })

  it('refuses a group with no cap of its own, rather than signing an uncapped URL', async () => {
    const signer = new RecordingSigner()
    // The group arrives from the client alongside the filename. An unknown one looks up to
    // `undefined`, and `declaredBytes > undefined` is false — so a module that trusts the
    // lookup does not merely mis-cap this upload, it caps it at nothing at all.
    const unknown = { ...request('image', 1_024), group: 'video' as MediaGroup }

    await expect(presignUpload(unknown, signer)).rejects.toBeInstanceOf(UnknownMediaGroupError)
    expect(signer.signed).toHaveLength(0)
  })
})
