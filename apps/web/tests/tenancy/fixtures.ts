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

/**
 * Deletes everything this harness creates, so a re-run starts from a known world.
 *
 * **Reverse registry order**, and that is not cosmetic. `seedDataFor` can only relate a
 * collection to one declared *before* it, so dependants always sit later in the list — which
 * means deleting forwards removes a row while its referrer still points at it, and Postgres
 * refuses on the foreign key. Measured when `projeto` joined the registry after
 * `categoriaProjeto`: `resetWorld` began failing inside `payload.delete`, which threw in
 * `beforeAll` and took **every** tenancy suite down with it — twelve files reporting
 * "skipped" rather than one reporting a broken fixture.
 *
 * The rule holds for any future pair, so it is expressed as the reverse of the order the seed
 * loop uses rather than as a hand-kept list of which collection depends on which.
 */
export async function resetWorld(payload: Payload): Promise<void> {
  for (const collection of [...scopedCollections()].reverse()) {
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
function seedDataFor(
  collection: string,
  marker: string,
  userId: string | number,
  /**
   * The ids already seeded for THIS organization, keyed by collection. A relation under
   * `sameTenant` cannot be seeded from a literal — it must point at the row belonging to the
   * same tenant, or the validator refuses the create and the whole harness aborts in
   * `beforeAll`. `scopedCollections()` iterates in registry order, so a collection may only
   * relate to one declared before it.
   */
  seeded: Record<string, string | number>,
) {
  switch (collection) {
    case 'tenantCanaries':
      return { label: `canary-${marker}` }
    case 'pendingInvites':
      return { email: `invitee-${marker}@example.com`, role: 'maker', invitedBy: userId }
    case 'categoriaProjeto':
      return { nome: `Categoria ${marker}`, slug: `categoria-${marker}` }
    // `projeto` relates to `categoriaProjeto` under `sameTenant`, so its row cannot be seeded
    // from a literal — it needs the id of the category seeded into the SAME organization.
    // `seedScoped` below resolves that from `rows`, which is why this case names the relation
    // rather than inventing an id.
    case 'projeto':
      return {
        titulo: `Projeto ${marker}`,
        slug: `projeto-${marker}`,
        descricaoCurta: `Projeto de fixture ${marker}.`,
        // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
        imagemCapa: 'media/image/00000000-0000-4000-8000-000000000001.png',
        downloads: 0,
        categoria: seeded.categoriaProjeto,
        curtidas: 0,
        status: 'rascunho',
      }
    // The upload collections (T023b). No fields of their own and no file: `upload.filesRequiredOnCreate`
    // is false precisely so a row can exist without an object store, which CI does not run.
    // What the harness asserts about them is tenancy, and a fileless row carries a tenant
    // exactly like any other.
    case 'midiaImagem':
    case 'midiaModelo3d':
    case 'midiaDocumento':
      return {}
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
    const create = async (
      marker: 'A' | 'B',
      tenant: string | number,
      userId: string | number,
      seeded: Record<string, string | number>,
    ) =>
      (await payload.create({
        collection: collection as never,
        data: { ...seedDataFor(collection, marker, userId, seeded), tenant } as never,
        overrideAccess: true,
      })) as unknown as { id: string | number }

    const seededFor = (marker: 'A' | 'B'): Record<string, string | number> =>
      Object.fromEntries(Object.entries(rows).map(([slug, ids]) => [slug, ids[marker]]))

    const rowA = await create('A', a.id, userA.id, seededFor('A'))
    const rowB = await create('B', b.id, userB.id, seededFor('B'))
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
