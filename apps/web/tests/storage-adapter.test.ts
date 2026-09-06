import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

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
  it('turns clientUploads on — the bytes never pass through Node', () => {
    expect(
      optionsFor(MINIO_ENV).clientUploads,
      'clientUploads is off, so uploads would stream through the Node process. The whole ' +
        'presign/quarantine/verify design (plan § Sketch 4) assumes it is on.',
    ).toBe(true)
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
  it('registers the client-upload signed URL endpoint', async () => {
    const config = await webConfig.default
    const paths = (config.endpoints ?? []).map((endpoint) => endpoint.path)
    expect(
      paths,
      `buildConfig produced no ${SIGNED_URL_PATH} route, so s3Storage({ clientUploads }) ` +
        'never ran. The browser has nowhere to ask for a presigned PUT.',
    ).toContain(SIGNED_URL_PATH)
  })
})
