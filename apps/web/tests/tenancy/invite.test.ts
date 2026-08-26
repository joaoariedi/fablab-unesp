import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { canInvite, resolveInvite } from '../../lib/tenancy/invite'
import { buildWorld, type Fixture } from './fixtures'

/**
 * Invite semantics (FR-021, FR-029, SC-007, US8).
 *
 * The behaviour worth protecting is not "an invite works" — it is that **an outsider cannot
 * learn whether an address already has an account**. Every assertion below exists to keep
 * one of the observable channels shut: the outcome, the stored rows, or repetition.
 */

let world: Fixture

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

const countUsers = async (email: string) => {
  const payload = await getPayload({ config })
  const r = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    overrideAccess: true,
  })
  return r.totalDocs
}

describe('canInvite: who may invite (US8)', () => {
  it('lets a master invite into any organization', () => {
    expect(canInvite(world.master as never, world.orgA.id)).toBe(true)
    expect(canInvite(world.master as never, world.orgB.id)).toBe(true)
  })

  it('lets an organization admin invite into their OWN organization only', () => {
    expect(canInvite(world.userA as never, world.orgA.id)).toBe(true)
    expect(
      canInvite(world.userA as never, world.orgB.id),
      'an admin of A could invite into B — cross-tenant privilege escalation',
    ).toBe(false)
  })

  it('refuses an anonymous caller', () => {
    expect(canInvite(null, world.orgA.id)).toBe(false)
  })

  it('refuses a member who is not an admin', () => {
    // Membership alone must not carry invite rights: a maker who could invite would grant
    // themselves `admin` through a second account.
    const maker = { id: 99, role: 'user', orgs: [{ organization: world.orgA.id, role: 'maker' }] }
    expect(canInvite(maker, world.orgA.id)).toBe(false)
  })
})

describe('resolveInvite: an existing account gains a membership, never a second account', () => {
  it('adds a membership for an e-mail that already has an account elsewhere', async () => {
    // userB belongs to organization B. Inviting them into A must add a membership, not a
    // duplicate identity — identity is global (FR-009).
    const email = (world.userB as { email: string }).email
    const before = await countUsers(email)

    const outcome = await resolveInvite({
      organizationId: world.orgA.id,
      email,
      role: 'staff',
      invitedBy: world.master.id as string | number,
    })

    expect(outcome).toBe('membership-added')
    expect(await countUsers(email), 'a second account was created for an existing e-mail').toBe(before)

    const payload = await getPayload({ config })
    const updated = await payload.findByID({
      collection: 'users',
      id: (world.userB as { id: string | number }).id,
      depth: 0,
      overrideAccess: true,
    })
    const orgs = (updated as { orgs?: { organization?: unknown; role?: string }[] }).orgs ?? []
    const idOf = (r: { organization?: unknown }) => {
      const ref = r.organization
      return String(typeof ref === 'object' && ref !== null && 'id' in ref ? ref.id : ref)
    }
    expect(orgs.map(idOf).sort()).toEqual([world.orgA.id, world.orgB.id].sort())
    expect(orgs.find((r) => idOf(r) === world.orgA.id)?.role).toBe('staff')
  })

  it('is a no-op when the person is already a member', async () => {
    const email = (world.userB as { email: string }).email
    const outcome = await resolveInvite({
      organizationId: world.orgA.id,
      email,
      role: 'maker',
      invitedBy: world.master.id as string | number,
    })
    expect(outcome).toBe('already-member')

    // And the existing role is NOT downgraded by a repeat invite at a lower role.
    const payload = await getPayload({ config })
    const updated = await payload.findByID({
      collection: 'users',
      id: (world.userB as { id: string | number }).id,
      depth: 0,
      overrideAccess: true,
    })
    const orgs = (updated as { orgs?: { organization?: unknown; role?: string }[] }).orgs ?? []
    const rowA = orgs.find((r) => {
      const ref = r.organization
      return String(typeof ref === 'object' && ref !== null && 'id' in ref ? ref.id : ref) === world.orgA.id
    })
    expect(rowA?.role, 'a repeat invite silently changed an existing role').toBe('staff')
  })
})

describe('resolveInvite: an unknown e-mail creates NO account (FR-029)', () => {
  const unknown = 'never-seen@example.com'

  it('records a pending invite and no user', async () => {
    const outcome = await resolveInvite({
      organizationId: world.orgA.id,
      email: unknown,
      role: 'maker',
      invitedBy: world.master.id as string | number,
    })
    expect(outcome).toBe('pending-invite-created')

    // The constitution gates signup on terms acceptance, so someone who never consented
    // must not exist as an account. Feature 004 creates it at acceptance.
    expect(await countUsers(unknown), 'an account was created before terms acceptance').toBe(0)

    const payload = await getPayload({ config })
    const invites = await payload.find({
      collection: 'pendingInvites',
      where: { email: { equals: unknown } },
      depth: 0,
      overrideAccess: true,
    })
    expect(invites.totalDocs).toBe(1)
  })

  it('a repeat invite is an idempotent no-op, not a duplicate row', async () => {
    const outcome = await resolveInvite({
      organizationId: world.orgA.id,
      email: unknown,
      role: 'maker',
      invitedBy: world.master.id as string | number,
    })
    expect(outcome).toBe('already-invited')

    const payload = await getPayload({ config })
    const invites = await payload.find({
      collection: 'pendingInvites',
      where: { email: { equals: unknown } },
      overrideAccess: true,
    })
    expect(invites.totalDocs, 'the unique index did not hold').toBe(1)
  })

  it('the same address may be invited independently by a DIFFERENT organization', async () => {
    // (tenant, email) is unique, not email. One organization's invite must not reveal — or
    // block — another's.
    const outcome = await resolveInvite({
      organizationId: world.orgB.id,
      email: unknown,
      role: 'maker',
      invitedBy: world.master.id as string | number,
    })
    expect(outcome).toBe('pending-invite-created')

    const payload = await getPayload({ config })
    const invites = await payload.find({
      collection: 'pendingInvites',
      where: { email: { equals: unknown } },
      overrideAccess: true,
    })
    expect(invites.totalDocs).toBe(2)
  })
})
