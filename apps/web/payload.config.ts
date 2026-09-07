import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { s3Storage } from '@payloadcms/storage-s3'
import type { CollectionConfig } from 'payload'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Artigo } from './collections/content/Artigo'
import { Aula } from './collections/content/Aula'
import { CategoriaArtigo } from './collections/content/CategoriaArtigo'
import { CategoriaModelo } from './collections/content/CategoriaModelo'
import { CategoriaProjeto } from './collections/content/CategoriaProjeto'
import { Curtida } from './collections/content/Curtida'
import { Evento } from './collections/content/Evento'
import { Local } from './collections/content/Local'
import { Maquina } from './collections/content/Maquina'
import { Modelo3d } from './collections/content/Modelo3d'
import { PerfilMaker } from './collections/content/PerfilMaker'
import { ProgressoAula } from './collections/content/ProgressoAula'
import { Projeto } from './collections/content/Projeto'
import { MEDIA_COLLECTIONS, MEDIA_SLUGS } from './collections/Media'
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
const collections = [
  Organizations,
  Users,
  TenantCanaries,
  PendingInvites,
  CategoriaProjeto,
  Projeto,
  // The 002b eleven (T044). Order mirrors SCOPE_REGISTRY, which `fixtures.ts` seeds in and
  // `resetWorld` deletes in reverse — keeping the two lists in the same order is what makes a
  // "did this one land?" question answerable by reading them side by side.
  PerfilMaker,
  CategoriaArtigo,
  Artigo,
  CategoriaModelo,
  Modelo3d,
  Aula,
  ProgressoAula,
  Local,
  Maquina,
  Evento,
  Curtida,
  // The upload collections D1 made necessary (T023b). Spread rather than listed one by one:
  // they are derived from MEDIA_GROUPS, so a fourth media group arrives here on its own
  // instead of existing in `limits.ts` with nowhere to be uploaded to.
  ...MEDIA_COLLECTIONS,
]

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

    // **Off, deliberately — the bytes pass through Node** (decision D1, 2026-09-06).
    //
    // Plan § Sketch 4 chose presigned direct-to-storage, and spike S1 measured its price:
    // `generateFileData` returns at `if (!file)` before `checkFileRestrictions` and before
    // `imageSizes`, so Payload's per-field `mimeTypes`, its per-field `filesize` and its entire
    // image pipeline are inert on that path — each then has to be rebuilt by hand.
    //
    // Three workflow runs established the rebuild cannot be finished: the plugin's signed-URL
    // handler takes a global cap and no field at all, `ClientUploadsConfig` is
    // `{ access? } | boolean` with no per-field hook, and the admin UI — the only uploader in
    // the product — is bound to that handler by a path the plugin names internally. The
    // per-field caps FR-012 requires were unreachable while this stayed on.
    //
    // Off, the framework enforces them itself. The cost is the one `tech-stack.md` already
    // named: a single Node process carrying upload traffic. That is a capacity question about a
    // host nobody has specified, and it belongs with feature 008.
    clientUploads: false,

    // Derived, never hand-listed: a list written by hand rots the first time a collection
    // gains or loses an upload — silently, into local disk storage.
    // `true as const`, not `true`: `Object.fromEntries` widens to `Record<string, boolean>`,
    // and the adapter's option is `true | CollectionOptions` — `false` is not a member. It
    // typechecks either way while `payload-types.ts` exists locally and fails in CI, which has
    // no generated types, so the widening is invisible until the pipeline runs.
    collections: Object.fromEntries(
      adapted
        .filter((collection) => Boolean(collection.upload))
        .map(({ slug }) => [slug, true as const]),
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

  // **The outer ceiling on every upload, whatever the collection** (FR-012, SC-007).
  //
  // Payload applies this to the multipart body before a collection is even chosen, so it is the
  // bound that holds when a per-collection guard is missing or wrong. It is deliberately the
  // LARGEST group cap, not the smallest: a global limit below `document`'s 200 MB would refuse
  // legitimate archives, and the per-group caps are enforced where the group is known —
  // `collections/Media.ts`, one collection per group.
  //
  // Its history is worth keeping. Before D1 this was the *only* size bound in the product:
  // `@payloadcms/storage-s3`'s signed-URL handler reads exactly this number and nothing else
  // (measured in generateSignedURL.js — unset, it skips the refusal and signs
  // `ContentLength: undefined`), and it takes no field, so per-field caps were unreachable
  // while `clientUploads` was on. That is the measurement D1 acted on.
  upload: {
    limits: { fileSize: MAX_UPLOAD_CAP_BYTES },
  },

  // Payload 3 ships no editor by default — a `richText` field without one throws at config
  // load. Lexical is the framework's own default, which spec.md § Decisions settles in writing:
  // Principle 1 asks for justification to *add* to the stack, and choosing the default adds
  // nothing, whereas a markdown pipeline would add an editor, a renderer and a sanitiser.
  editor: lexicalEditor(),

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
        // The 002b eleven (T044). Every one carries content, a roster or an interaction that
        // belongs to exactly one lab, so every one is listed: a collection reaching the config
        // but not this map would carry no tenant column at all, and `scopedAccess()` would then
        // constrain on a field that does not exist.
        perfilMaker: {},
        categoriaArtigo: {},
        artigo: {},
        categoriaModelo: {},
        modelo3d: {},
        aula: {},
        progressoAula: {},
        local: {},
        maquina: {},
        evento: {},
        curtida: {},
        // Uploaded media is one lab's. Derived from MEDIA_SLUGS for the same reason the
        // collections themselves are: a media group that reached the config but not this map
        // would carry no tenant column at all, and every lab would list every other lab's
        // files in the admin media view.
        ...Object.fromEntries(Object.values(MEDIA_SLUGS).map((slug) => [slug, {}])),
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
