import { getPayload } from 'payload'

import config from '../payload.config'
import { readEnv } from '../lib/env'

/**
 * Bootstrap for a fresh database (FR-026, CLR-003, US1).
 *
 * Two properties matter more than what it creates:
 *
 * **Idempotent.** Re-running on an existing database duplicates neither the organization
 * nor the master (US1 edge case). The quick start tells a newcomer to run this, and a
 * newcomer will run it twice — once because they missed the output, once because something
 * else failed and re-running is the obvious thing to try. Both must be harmless.
 *
 * **No credential ever reaches production configuration.** The master is seeded from
 * `SEED_MASTER_*` **only** outside production. In production the first master is created
 * through Payload's create-first-user screen at `/admin`, so nothing in the deployed
 * environment holds a password that was written down somewhere first. Setting
 * `SEED_MASTER_*` in production is **ignored**, not honoured — silently doing what the
 * operator appears to have asked for would be the wrong kind of helpful.
 *
 * The seed writes directly through Payload rather than the tenancy choke point: it creates
 * the *first* organization, so there is no tenant to be scoped to yet, and it runs before
 * any request exists. `eslint.config.mjs` allowlists `seed/**` for exactly this reason.
 */

/** The organization every CITe deployment starts with. `bauru` matches `bauru.plataforma.br`. */
export const CITE_ORGANIZATION = {
  slug: 'bauru',
  name: 'Fab Lab CITe Bauru',
} as const

export type SeedReport = {
  organization: 'created' | 'already-present'
  master: 'created' | 'already-present' | 'skipped-production' | 'skipped-not-configured'
  organizationId: string | number
  notes: string[]
}

export async function seed(): Promise<SeedReport> {
  const env = readEnv()
  const payload = await getPayload({ config })
  const notes: string[] = []

  // --- organization ---------------------------------------------------------------------

  const existingOrg = await payload.find({
    collection: 'organizations',
    where: { slug: { equals: CITE_ORGANIZATION.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  let organizationId: string | number
  let organization: SeedReport['organization']

  if (existingOrg.docs[0]) {
    organizationId = existingOrg.docs[0].id
    organization = 'already-present'
  } else {
    const created = await payload.create({
      collection: 'organizations',
      data: {
        name: CITE_ORGANIZATION.name,
        slug: CITE_ORGANIZATION.slug,
        status: 'active',
      },
      overrideAccess: true,
    })
    organizationId = created.id
    organization = 'created'
    // Creating it fired seedNewOrganization, so any defaults registered by later features
    // are already copied in — this seed does not need to know what they are.
    notes.push('seed-on-create hooks ran for the new organization')
  }

  // --- master ---------------------------------------------------------------------------

  if (env.NODE_ENV === 'production') {
    return {
      organization,
      organizationId,
      master: 'skipped-production',
      notes: [
        ...notes,
        'Production: no master seeded by design. Create the first user at /admin — ' +
          'Payload shows the create-first-user screen while the users collection is empty.',
      ],
    }
  }

  const email = env.SEED_MASTER_EMAIL
  const password = env.SEED_MASTER_PASSWORD
  if (!email || !password) {
    return {
      organization,
      organizationId,
      master: 'skipped-not-configured',
      notes: [
        ...notes,
        'SEED_MASTER_EMAIL / SEED_MASTER_PASSWORD not set — no master seeded. ' +
          'Set them in .env, or create the first user at /admin.',
      ],
    }
  }

  const existingMaster = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  if (existingMaster.docs[0]) {
    // Deliberately does NOT rewrite the password. Re-running the seed must not silently
    // reset a credential someone has since changed — idempotent means "no further effect",
    // not "restore my defaults".
    return {
      organization,
      organizationId,
      master: 'already-present',
      notes: [...notes, `Master ${email} already exists; password left untouched.`],
    }
  }

  await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      role: 'master',
      // A master reads across organizations through `userHasAccessToAllTenants`, not through
      // membership, so it deliberately belongs to none.
      orgs: [],
    },
    overrideAccess: true,
  })

  return {
    organization,
    organizationId,
    master: 'created',
    notes: [...notes, `Master ${email} created (development only).`],
  }
}
