import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { s3Storage } from '@payloadcms/storage-s3'
import type { CollectionConfig } from 'payload'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { CategoriaProjeto } from './collections/content/CategoriaProjeto'
import { Projeto } from './collections/content/Projeto'
import { Organizations } from './collections/Organizations'
import { PendingInvites } from './collections/PendingInvites'
import { TenantCanaries } from './collections/TenantCanaries'
import { isMaster, Users } from './collections/Users'
import { readEnv } from './lib/env'
import { MAX_UPLOAD_CAP_BYTES } from './lib/uploads/limits'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Throws MissingEnvError naming the variable and its expected shape (US1's error case).
// This runs at config load, which includes `next build` — CI must provide the environment
// for the build and drift jobs, which it needs for migrations anyway.
const env = readEnv()

/** Every collection the app registers, in one place so the storage map is derived from it. */
const collections = [Organizations, Users, TenantCanaries, PendingInvites, CategoriaProjeto, Projeto]

/**
 * The S3 adapter's options, as a **pure function of the environment** (FR-019, SC-011).
 *
 * Exported so the swap can be *driven* rather than eyeballed: pointing the five `S3_*`
 * variables at a managed bucket must be a config change with a clean `git diff`, and the only
 * way to assert that is to call this with two environments and compare the results. An
 * object literal inlined into `buildConfig` below would be untestable — asserting its shape
 * would assert nothing about the swap.
 *
 * Two values are computed rather than configured, because getting either wrong is silent:
 *   - `forcePathStyle` follows the *presence of an endpoint*. MinIO serves buckets
 *     path-style, managed S3 serves them virtual-hosted; hardcoding either makes the swap a
 *     code change, which is what FR-019 forbids.
 *   - `credentials` is **omitted entirely** when no keys are set, never sent as empty
 *     strings. Empty credentials make the SDK skip its default provider chain, so a host
 *     carrying an IAM role authenticates as nobody and every upload 403s.
 *
 * @example s3StorageOptions(readEnv(), collections).config.forcePathStyle // true on MinIO
 */
export function s3StorageOptions(
  source: Pick<
    ReturnType<typeof readEnv>,
    'S3_ENDPOINT' | 'S3_BUCKET' | 'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_REGION'
  >,
  adapted: readonly Pick<CollectionConfig, 'slug' | 'upload'>[] = [],
) {
  const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = source

  return {
    // `?? ''` rather than a throw: the CI test job runs with no `S3_*` at all, and a config
    // that refuses to load without a bucket would take every unrelated test down with it.
    // A missing bucket surfaces at the first upload, which is where it is actionable.
    bucket: source.S3_BUCKET ?? '',

    // Spike S1: the bytes go browser → storage by presigned PUT and never through Node,
    // which is what the whole presign/quarantine/verify design rests on (plan § Sketch 4).
    clientUploads: true,

    // Derived, never hand-listed: a list written by hand rots the first time a collection
    // gains or loses an upload — silently, into local disk storage.
    collections: Object.fromEntries(
      adapted.filter((collection) => Boolean(collection.upload)).map(({ slug }) => [slug, true]),
    ),

    config: {
      endpoint: source.S3_ENDPOINT,
      region: source.S3_REGION,
      forcePathStyle: Boolean(source.S3_ENDPOINT),
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    },
  }
}

export default buildConfig({
  secret: env.PAYLOAD_SECRET,

  db: postgresAdapter({
    pool: { connectionString: env.DATABASE_URI },
    migrationDir: path.resolve(dirname, 'migrations'),
    // FR-004: committed migrations are the source of truth. `push` writes schema changes
    // straight to the database without producing a migration file, which is precisely how
    // dev and prod drift apart — the architecture document names this risk number one.
    push: env.NODE_ENV !== 'production',
  }),

  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '— Fab Lab CITe Bauru',
    },
  },

  // Order is load-bearing: the multi-tenant plugin must be registered before the first
  // content collection exists (FR-007). Adopting it later means renaming fields, rewriting
  // access control and migrating data. Feature 000 exists to get this ordering right once.
  collections,

  // **The only size bound the live presign path has** (FR-012, SC-007).
  //
  // `@payloadcms/storage-s3`'s signed-URL handler reads exactly this number and nothing else:
  // measured in generateSignedURL.js, it refuses an over-cap request and adds `content-length`
  // to the signed headers ONLY when it is set, and otherwise signs `ContentLength: undefined`.
  // Left unset — as it was — any signed-in user could obtain a signed URL for a PUT of any size,
  // and `tech-stack.md` names disk exhaustion as failure number one.
  //
  // It is global, so it is a CEILING, not the policy. Per-group caps (UPLOAD_CAP_BYTES) cannot
  // be expressed through the plugin, and `lib/uploads/presign.ts` — which does express them —
  // has no caller until an endpoint of ours replaces the plugin's. Until then an image field is
  // bounded at 200 MB rather than at 10 MB. Recorded in tasks.md against T016b, not left implied.
  upload: {
    limits: { fileSize: MAX_UPLOAD_CAP_BYTES },
  },

  // Payload has no image pipeline of its own — it delegates every image operation to sharp,
  // and only when sharp is handed to buildConfig. Spike S1 measured it absent from both the
  // manifest and this config, which makes `imageSizes` a no-op on *every* path (not just the
  // direct-upload one): the size fields exist on the document and stay empty forever.
  sharp,

  plugins: [
    multiTenantPlugin({
      tenantsSlug: Organizations.slug,

      // The plugin's own escape hatch for cross-tenant readers. Spike S3 confirmed that when
      // this returns true the plugin adds **no** tenant constraint at all — which is exactly
      // the "master is the sole cross-tenant reader" semantics, implemented by the plugin
      // rather than by us.
      userHasAccessToAllTenants: (user) => isMaster(user as { role?: string }),

      // Spike S2 verified this exact shape persists as `orgs: [{ organization, role, id }]`.
      // `rowFields` is only available when `includeDefaultField` is true.
      tenantsArrayField: {
        includeDefaultField: true,
        arrayFieldName: 'orgs',
        arrayTenantFieldName: 'organization',
        rowFields: [
          {
            name: 'role',
            type: 'select',
            required: true,
            defaultValue: 'maker',
            label: 'Papel nesta organização',
            options: [
              { label: 'Admin da organização', value: 'admin' },
              { label: 'Equipe', value: 'staff' },
              { label: 'Maker', value: 'maker' },
            ],
          },
        ],
      },

      // Every collection listed here gets the injected `tenant` field and tenant-composed
      // access. This list must agree with SCOPE_REGISTRY's `scoped` entries — registry.test.ts
      // fails the build in either direction of disagreement (FR-018).
      collections: {
        tenantCanaries: {},
        pendingInvites: {},
        categoriaProjeto: {},
        projeto: {},
      },
    }),

    // Registered after the tenant plugin so the storage adapter sees the collections the
    // tenant plugin has already shaped. The options are built by the exported pure function
    // above, driven by the environment — never by a literal written here.
    s3Storage(s3StorageOptions(env, collections)),
  ],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
