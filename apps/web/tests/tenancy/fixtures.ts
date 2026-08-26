import { getPayload, type Payload } from 'payload'

import config from '../../payload.config'
import { scopedCollections } from '../../lib/tenancy/scope-registry'

/**
 * Two organizations, their users, and a row of every scoped collection in each.
 *
 * Fixtures are created with `overrideAccess: true` **on purpose**: setting up the world is
 * not the thing under test, and forcing the setup through the guarded path would make a
 * broken guard look like a broken fixture.
 */

export type Fixture = {
  payload: Payload
  orgA: { id: string; slug: string; host: string }
  orgB: { id: string; slug: string; host: string }
  userA: Record<string, unknown>
  userB: Record<string, unknown>
  master: Record<string, unknown>
  /**
   * Real auth tokens, obtained through `payload.login`. The REST surfaces need them: an
   * unauthenticated REST call is refused before access control is ever consulted, so a
   * harness without tokens would assert 403-for-everyone and prove nothing about tenancy.
   */
  tokens: { userA: string; userB: string; master: string }
  /** Row ids per collection, per organization: rows.tenantCanaries.A */
  rows: Record<string, { A: string | number; B: string | number }>
}

const PASSWORD = 'fixture-password-123'

/** Deletes everything this harness creates, so a re-run starts from a known world. */
export async function resetWorld(payload: Payload): Promise<void> {
  for (const collection of scopedCollections()) {
    await payload.delete({
      collection: collection as never,
      where: { id: { exists: true } },
      overrideAccess: true,
    })
  }
  await payload.delete({
    collection: 'users',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { id: { exists: true } },
    overrideAccess: true,
  })
}

/** Minimal valid data for a scoped collection, so the matrix grows without editing this. */
function seedDataFor(collection: string, marker: string, userId: string | number) {
  switch (collection) {
    case 'tenantCanaries':
      return { label: `canary-${marker}` }
    case 'pendingInvites':
      return { email: `invitee-${marker}@example.com`, role: 'maker', invitedBy: userId }
    default:
      throw new Error(
        `fixtures.ts has no seed data for scoped collection "${collection}". ` +
          `Add it — otherwise the isolation harness silently skips that collection.`,
      )
  }
}

export async function buildWorld(): Promise<Fixture> {
  const payload = await getPayload({ config })
  await resetWorld(payload)

  const mk = async (slug: string, name: string) =>
    payload.create({
      collection: 'organizations',
      data: { name, slug, status: 'active' },
      overrideAccess: true,
    })

  const a = await mk('org-a', 'Organização A')
  const b = await mk('org-b', 'Organização B')

  const master = await payload.create({
    collection: 'users',
    data: { email: 'master@example.com', password: PASSWORD, role: 'master', orgs: [] },
    overrideAccess: true,
  })

  const userA = await payload.create({
    collection: 'users',
    data: {
      email: 'a@example.com',
      password: PASSWORD,
      role: 'user',
      orgs: [{ organization: a.id, role: 'admin' }],
    },
    overrideAccess: true,
  })

  const userB = await payload.create({
    collection: 'users',
    data: {
      email: 'b@example.com',
      password: PASSWORD,
      role: 'user',
      orgs: [{ organization: b.id, role: 'admin' }],
    },
    overrideAccess: true,
  })

  const rows: Fixture['rows'] = {}
  for (const collection of scopedCollections()) {
    // `collection as never` is how a dynamically-chosen slug is passed to Payload's
    // generically-typed API; the return widens to `never` with it, so the ids are read back
    // through an explicit shape rather than silenced with `any`.
    const create = async (marker: 'A' | 'B', tenant: string | number, userId: string | number) =>
      (await payload.create({
        collection: collection as never,
        data: { ...seedDataFor(collection, marker, userId), tenant } as never,
        overrideAccess: true,
      })) as unknown as { id: string | number }

    const rowA = await create('A', a.id, userA.id)
    const rowB = await create('B', b.id, userB.id)
    rows[collection] = { A: rowA.id, B: rowB.id }
  }

  const login = async (email: string): Promise<string> => {
    const result = await payload.login({
      collection: 'users',
      data: { email, password: PASSWORD },
    })
    const token = (result as { token?: string }).token
    if (!token) throw new Error(`fixtures: could not obtain a token for ${email}`)
    return token
  }

  return {
    payload,
    tokens: {
      userA: await login('a@example.com'),
      userB: await login('b@example.com'),
      master: await login('master@example.com'),
    },
    orgA: { id: String(a.id), slug: 'org-a', host: 'org-a.localhost' },
    orgB: { id: String(b.id), slug: 'org-b', host: 'org-b.localhost' },
    userA: { ...userA, collection: 'users' },
    userB: { ...userB, collection: 'users' },
    master: { ...master, collection: 'users' },
    rows,
  }
}
