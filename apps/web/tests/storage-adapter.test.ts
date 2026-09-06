import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { MEDIA_SLUGS } from '../collections/Media'
import * as webConfig from '../payload.config'

/**
 * FR-019 / SC-011: object storage is configured through **environment only**. Pointing the
 * five documented `S3_*` variables at a managed bucket instead of the local MinIO must be a
 * config change with a clean `git diff` — never an edit to this file.
 *
 * The adapter is therefore built by a pure function of the environment, and this file drives
 * that function with two environments — the compose stack's MinIO and a managed S3/R2 — and
 * asserts the resulting client config differs in exactly the ways the two backends require.
 * Asserting the shape of a hand-written object literal would assert nothing about the swap.
 *
 * `clientUploads: true` is checked twice on purpose: once on the options the builder returns,
 * and once on the **built** config, where the plugin has actually run. The first alone would
 * pass with the plugin never registered in `buildConfig` — a builder nobody calls.
 */

const MINIO_ENV = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'fablab',
  S3_ACCESS_KEY_ID: 'fablab',
  S3_SECRET_ACCESS_KEY: 'fablab-dev-secret',
  S3_REGION: 'us-east-1',
}

/**
 * A managed bucket reached at AWS's own endpoint, with no keys in the environment because
 * the host carries an instance role. Both differences are load-bearing, not decoration.
 */
const MANAGED_ENV = {
  S3_ENDPOINT: undefined,
  S3_BUCKET: 'fablab-producao',
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_REGION: 'sa-east-1',
}

type StorageEnv = typeof MINIO_ENV | typeof MANAGED_ENV

/** The signed-URL route `initClientUploads` registers when `clientUploads` is on. */
const SIGNED_URL_PATH = '/storage-s3-generate-signed-url'

function optionsFor(source: StorageEnv, collections: CollectionConfig[] = []) {
  const build = webConfig.s3StorageOptions as
    | ((source: StorageEnv, collections: CollectionConfig[]) => Record<string, unknown>)
    | undefined
  expect(
    typeof build,
    'payload.config.ts exports no s3StorageOptions(env, collections). FR-019 needs the ' +
      'adapter built from the environment, and needs it callable to prove it.',
  ).toBe('function')
  return build!(source, collections)
}

function clientConfigFor(source: StorageEnv) {
  return optionsFor(source).config as {
    endpoint?: string
    region?: string
    forcePathStyle?: boolean
    credentials?: { accessKeyId: string; secretAccessKey: string }
  }
}

describe('S3 adapter options are a function of the environment (FR-019)', () => {
  it('keeps clientUploads OFF, so Payload sees the bytes and can validate them', () => {
    // Inverted by decision D1 (2026-09-06), and the inversion is the point of the decision.
    // With `clientUploads: true`, spike S1 measured that `generateFileData` returns at
    // `if (!file)` before `checkFileRestrictions` and before `imageSizes` — so per-field
    // `mimeTypes`, per-field `filesize` and the whole image pipeline are inert, and FR-012's
    // per-field caps are unreachable because the plugin's presign handler takes no field.
    expect(
      optionsFor(MINIO_ENV).clientUploads,
      'clientUploads is on, so the bytes bypass Node and every per-field upload rule Payload ' +
        'would have enforced is silently skipped (spike S1).',
    ).toBe(false)
  })

  it('forces path-style addressing when a custom endpoint is configured (MinIO)', () => {
    expect(
      clientConfigFor(MINIO_ENV).forcePathStyle,
      'MinIO serves buckets path-style (http://host:9000/bucket/key). Without this every ' +
        'request goes to the virtual-host name bucket.host, which does not resolve.',
    ).toBe(true)
  })

  it('leaves virtual-hosted addressing in place when no endpoint is set (managed S3)', () => {
    expect(
      clientConfigFor(MANAGED_ENV).forcePathStyle,
      'A hardcoded forcePathStyle: true would make the managed-bucket swap a code change, ' +
        'which is exactly what FR-019 forbids.',
    ).toBe(false)
  })

  it('passes endpoint, region and bucket straight through from the environment', () => {
    const minio = clientConfigFor(MINIO_ENV)
    expect(minio.endpoint).toBe(MINIO_ENV.S3_ENDPOINT)
    expect(minio.region).toBe(MINIO_ENV.S3_REGION)
    expect(optionsFor(MINIO_ENV).bucket).toBe(MINIO_ENV.S3_BUCKET)

    const managed = clientConfigFor(MANAGED_ENV)
    expect(managed.endpoint, 'an endpoint invented for AWS defeats the swap').toBeUndefined()
    expect(managed.region).toBe(MANAGED_ENV.S3_REGION)
    expect(optionsFor(MANAGED_ENV).bucket).toBe(MANAGED_ENV.S3_BUCKET)
  })

  it('sends the static keys when they are set', () => {
    expect(clientConfigFor(MINIO_ENV).credentials).toEqual({
      accessKeyId: MINIO_ENV.S3_ACCESS_KEY_ID,
      secretAccessKey: MINIO_ENV.S3_SECRET_ACCESS_KEY,
    })
  })

  it('omits credentials entirely when no keys are set, rather than sending empty ones', () => {
    expect(
      clientConfigFor(MANAGED_ENV).credentials,
      'Empty-string credentials make the SDK skip its default provider chain, so a host ' +
        'with an IAM role authenticates as nobody and every upload 403s.',
    ).toBeUndefined()
  })

  it('derives the adapted collections from those declaring an upload', () => {
    const collections = [
      { slug: 'projeto', fields: [] },
      { slug: 'midia', fields: [], upload: true },
      { slug: 'arquivo', fields: [], upload: { mimeTypes: ['application/pdf'] } },
    ] as CollectionConfig[]

    expect(
      optionsFor(MINIO_ENV, collections).collections,
      'A list written by hand rots the first time a collection gains or loses an upload — ' +
        'silently, into local disk storage.',
    ).toEqual({ midia: true, arquivo: true })
  })
})

describe('the adapter is registered in buildConfig, not merely buildable', () => {
  it('registers NO client-upload signed URL route, because clientUploads is off', async () => {
    // The inverse of what this asserted before D1, and it is what proves the flip reached the
    // built config rather than only the options object. `initClientUploads` adds this route
    // when — and only when — `clientUploads` is truthy.
    const config = await webConfig.default
    const paths = (config.endpoints ?? []).map((endpoint) => endpoint.path)
    expect(
      paths,
      `${SIGNED_URL_PATH} is still registered, so clientUploads is still on somewhere and the ` +
        'browser can still presign a PUT that bypasses every per-field rule.',
    ).not.toContain(SIGNED_URL_PATH)
  })

  it('adapts exactly the collections that declare an upload — the three media ones', async () => {
    // Was "none yet", and the comment there named what would change it: the media collection
    // D1 requires (T023b). It exists now, as one collection per media group, so this asserts
    // the identity of the adapted set rather than its emptiness. An upload collection missing
    // from this map does not fail — it writes files to the app's own disk instead of the
    // bucket, which is the quietest way to lose them.
    //
    // `projeto` is still absent on purpose: it carries storage KEYS as text (D3, the
    // Organizations.ts precedent), so it declares no upload of its own.
    const config = await webConfig.default
    const adapted = [...Object.values(MEDIA_SLUGS)].sort()

    expect(
      config.collections.filter((collection) => collection.upload).map((c) => c.slug).sort(),
    ).toEqual(adapted)
    expect(optionsFor(MINIO_ENV, config.collections as never).collections).toEqual(
      Object.fromEntries(adapted.map((slug) => [slug, true])),
    )
  })
})
