import { beforeAll, describe, expect, it } from 'vitest'

import { unscopedFindUserIdByEmail, unscopedLookupTenant } from '../../lib/tenancy/unscoped'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The allowlisted bypasses (FR-013).
 *
 * Every function in `lib/tenancy/unscoped.ts` deliberately runs with access control off, so
 * each one gets its own test. The contract calls this list "exhaustive by design" — these
 * tests are what stop it from quietly growing a fourth member, and what pin the narrow
 * return shapes that keep each one from becoming a general-purpose reader.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

describe('unscopedLookupTenant', () => {
  it('returns the tenant of a document in ANY organization — that is its job', async () => {
    // It cannot be scoped: the whole question is "which tenant owns this?", and a
    // tenant-filtered query would answer by returning nothing.
    expect(await unscopedLookupTenant('tenantCanaries', world.rows.tenantCanaries!.A)).toBe(
      world.orgA.id,
    )
    expect(await unscopedLookupTenant('tenantCanaries', world.rows.tenantCanaries!.B)).toBe(
      world.orgB.id,
    )
  })

  it('returns ONLY the tenant id, never the document', async () => {
    // The narrow return type is the safety property. Handing back the document would make
    // this an unscoped reader that any lib/tenancy code could lean on.
    const result = await unscopedLookupTenant('tenantCanaries', world.rows.tenantCanaries!.A)
    expect(typeof result).toBe('string')
  })

  it('returns null for a missing document rather than throwing', async () => {
    // The validator treats an unresolvable reference as "not the same tenant" and rejects
    // it, so a throw here would turn a rejected write into a 500.
    expect(await unscopedLookupTenant('tenantCanaries', 99_999_999)).toBeNull()
  })

  it('returns null for a global collection, which has no tenant', async () => {
    expect(await unscopedLookupTenant('users', world.master.id as string | number)).toBeNull()
  })
})

describe('unscopedFindUserIdByEmail', () => {
  it('finds an account regardless of which organization it belongs to', async () => {
    // Identity is global. A tenant-scoped lookup would answer "not in this organization"
    // and the invite would create a second account for someone who already exists — the
    // outcome FR-021 forbids.
    const email = (world.userB as { email: string }).email
    expect(String(await unscopedFindUserIdByEmail(email))).toBe(String(world.userB.id))
  })

  it('returns null for an unknown address', async () => {
    expect(await unscopedFindUserIdByEmail('nobody-here@example.com')).toBeNull()
  })

  it('returns ONLY the id — never a user object', async () => {
    // Anything richer becomes an account-enumeration oracle the moment it reaches a
    // response (US8). The id alone is what the invite path needs.
    const result = await unscopedFindUserIdByEmail((world.userA as { email: string }).email)
    expect(typeof result === 'string' || typeof result === 'number').toBe(true)
    expect(result).not.toHaveProperty('email')
  })
})

describe('the allowlist stays exhaustive', () => {
  it('exports exactly the two functions the contract declares', async () => {
    // contracts/tenancy.md calls this list exhaustive by design. A third export here means
    // a bypass was added without the contract being updated — which is the review signal.
    const mod = await import('../../lib/tenancy/unscoped')
    expect(Object.keys(mod).sort()).toEqual(
      ['unscopedFindUserIdByEmail', 'unscopedLookupTenant'].sort(),
    )
  })
})
