import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { MAX_UPLOAD_CAP_BYTES, UPLOAD_CAP_BYTES } from '../../lib/uploads/limits'

/**
 * T016 / FR-012, SC-007 — the signed URL is bounded.
 *
 * `lib/uploads/presign.ts` expresses the per-group policy and has 20 passing tests, and none of
 * that reached production: nothing imports it, and the endpoint the app actually serves is
 * `@payloadcms/storage-s3`'s own `getGenerateSignedURLHandler`, wired by T003's
 * `clientUploads: true`. That handler reads exactly one number — `upload.limits.fileSize` —
 * and it is global. Measured in `generateSignedURL.js`: it refuses an over-cap request and adds
 * `content-length` to the signed headers **only** when that value is set, and otherwise signs
 * `ContentLength: undefined`.
 *
 * So with it unset, every signed-in user could obtain a signed URL for a PUT of any size. This
 * file asserts against the **built config**, not against the constants module, because the
 * constant existing proves nothing about the handler that reads it — that is exactly the gap
 * that let a fully-tested presign module coexist with an unbounded presign path.
 */
describe('the live presign path carries a size bound (FR-012, SC-007)', () => {
  it('sets upload.limits.fileSize, the one value the plugin actually reads', async () => {
    const config = await configPromise
    expect(
      config.upload?.limits?.fileSize,
      'buildConfig declares no upload.limits.fileSize. @payloadcms/storage-s3 signs ' +
        'ContentLength: undefined without it, so any signed-in user can presign a PUT of any ' +
        'size — the disk-exhaustion failure tech-stack.md names as number one.',
    ).toBe(MAX_UPLOAD_CAP_BYTES)
  })

  it('bounds it at the largest declared cap, derived rather than retyped', () => {
    // Non-vacuity for the case above: asserting the config equals the constant proves nothing
    // if the constant is itself a number somebody typed. It must track the caps table.
    expect(MAX_UPLOAD_CAP_BYTES).toBe(Math.max(...Object.values(UPLOAD_CAP_BYTES)))
    expect(
      MAX_UPLOAD_CAP_BYTES,
      'the ceiling fell below a declared group cap, so that group can no longer be uploaded',
    ).toBeGreaterThanOrEqual(UPLOAD_CAP_BYTES.document)
  })

  it('is a ceiling and NOT the per-group policy — recorded, not implied', () => {
    // The honest boundary. This test exists so nobody reads the two above as "FR-012 is done":
    // the plugin has no per-group hook, so an image field is bounded at the document cap until
    // an endpoint of ours calls presignUpload. If these ever become equal, the distinction has
    // collapsed and the comment in payload.config.ts is stale.
    expect(
      MAX_UPLOAD_CAP_BYTES,
      'image and document caps are equal, so this ceiling now IS the per-group policy for ' +
        'images and the T016b gap has closed or the caps table changed — revisit both.',
    ).toBeGreaterThan(UPLOAD_CAP_BYTES.image)
  })
})
