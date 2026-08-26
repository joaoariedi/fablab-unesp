import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { buildConfig } from 'payload'

import { Organizations } from './collections/Organizations'
import { PendingInvites } from './collections/PendingInvites'
import { TenantCanaries } from './collections/TenantCanaries'
import { isMaster, Users } from './collections/Users'
import { readEnv } from './lib/env'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Throws MissingEnvError naming the variable and its expected shape (US1's error case).
// This runs at config load, which includes `next build` — CI must provide the environment
// for the build and drift jobs, which it needs for migrations anyway.
const env = readEnv()

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
  collections: [Organizations, Users, TenantCanaries, PendingInvites],

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
      },
    }),
  ],

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
