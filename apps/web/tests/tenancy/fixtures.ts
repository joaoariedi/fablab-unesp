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

type SeedContext = {
  /** `A` or `B` — the organization this row is being seeded into. */
  marker: string
  /** The user who owns this organization, for the fields that name an account. */
  userId: string | number
  /**
   * The ids already seeded for THIS organization, keyed by collection. A relation under
   * `sameTenant` cannot be seeded from a literal — it must point at the row belonging to the
   * same tenant, or the validator refuses the create and the whole harness aborts in
   * `beforeAll`. `scopedCollections()` iterates in registry order, so a collection may only
   * relate to one declared before it.
   */
  seeded: Record<string, string | number>
}

/**
 * The smallest Lexical document Payload accepts for a required `richText` field.
 *
 * Written out rather than imported: `@payloadcms/richtext-lexical` exposes its default value
 * through the editor instance, not as a constant, and a fixture that had to build an editor
 * to seed a paragraph would drag the whole editor package into every tenancy test.
 */
const lexicalParagraph = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        textFormat: 0,
        children: [
          { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

/**
 * Minimal valid data per scoped collection, so the matrix grows without editing the caller.
 *
 * A **table rather than a `switch`**: twenty collections of seed data in one function is well
 * past the 50-line limit, and the day a twenty-first arrives the table takes it as one entry
 * instead of pushing the function further over.
 */
const SEED_DATA: Record<string, (ctx: SeedContext) => Record<string, unknown>> = {
  tenantCanaries: ({ marker }) => ({ label: `canary-${marker}` }),
  pendingInvites: ({ marker, userId }) => ({
    email: `invitee-${marker}@example.com`,
    role: 'maker',
    invitedBy: userId,
  }),
  categoriaProjeto: ({ marker }) => ({ nome: `Categoria ${marker}`, slug: `categoria-${marker}` }),
  // The upload collections (T023b). No fields of their own and no file: `upload.filesRequiredOnCreate`
  // is false precisely so a row can exist without an object store, which CI does not run.
  // What the harness asserts about them is tenancy, and a fileless row carries a tenant
  // exactly like any other.
  midiaImagem: () => ({}),
  midiaModelo3d: () => ({}),
  midiaDocumento: () => ({}),
  // `projeto` relates to `categoriaProjeto` under `sameTenant`, so its row cannot be seeded
  // from a literal — it needs the id of the category seeded into the SAME organization.
  // `seededFor` below resolves that from `rows`, which is why this entry names the relation
  // rather than inventing an id.
  projeto: ({ marker, seeded }) => ({
    titulo: `Projeto ${marker}`,
    slug: `projeto-${marker}`,
    descricaoCurta: `Projeto de fixture ${marker}.`,
    // Required (obrigatório in projetos.md): a storage key, generated, never a filename.
    // The media row seeded for THIS organization, resolved through `seeded` — a bare key
    // would now be a foreign key with no constraint, and `sameTenant` would refuse a media
    // document belonging to the other lab.
    imagemCapa: seeded.midiaImagem,
    downloads: 0,
    categoria: seeded.categoriaProjeto,
    curtidas: 0,
    status: 'rascunho',
  }),
  // The 002b eleven (T044), in registry order. Every relationship below points at a row
  // seeded into the SAME organization, because `sameTenant` refuses anything else — which is
  // also why the order these appear in is the order they are declared in the registry.
  perfilMaker: ({ marker, userId }) => ({
    nome: `Maker ${marker}`,
    // Not `unique` on the collection (CLR-002), so two labs may hold the same handle; the
    // marker keeps the two fixture profiles distinguishable in a failure message anyway.
    handle: `@maker${marker.toLowerCase()}`,
    usuario: userId,
  }),
  categoriaArtigo: ({ marker }) => ({
    nome: `Eixo ${marker}`,
    slug: `eixo-${marker}`,
    ordem: 1,
  }),
  artigo: ({ marker, seeded }) => ({
    titulo: `Artigo ${marker}`,
    slug: `artigo-${marker}`,
    resumo: `Resumo do artigo ${marker}.`,
    corpo: lexicalParagraph(`Corpo do artigo ${marker}.`),
    capa: seeded.midiaImagem,
    categoria: seeded.categoriaArtigo,
    autor: seeded.perfilMaker,
  }),
  categoriaModelo: ({ marker, seeded }) => ({
    nome: `Categoria 3D ${marker}`,
    slug: `categoria-3d-${marker}`,
    icone: seeded.midiaImagem,
  }),
  modelo3d: ({ marker, seeded }) => ({
    titulo: `Modelo ${marker}`,
    slug: `modelo-${marker}`,
    descricaoCurta: `Modelo de fixture ${marker}.`,
    thumbnail: seeded.midiaImagem,
    // Polymorphic, so the reference carries its collection. `deriveFormatos` reads these
    // through the choke point on every save — which is why `buildWorld` seeds with a host
    // header rather than a bare Local API call.
    arquivosModelo: [{ relationTo: 'midiaModelo3d', value: seeded.midiaModelo3d }],
    categoria: seeded.categoriaModelo,
    autor: seeded.perfilMaker,
  }),
  aula: ({ marker, seeded }) => ({
    titulo: `Aula ${marker}`,
    slug: `aula-${marker}`,
    descricao: `Aula de fixture ${marker}.`,
    thumbnail: seeded.midiaImagem,
    videoUrl: `https://example.test/aula-${marker}`,
    duracaoMin: 10,
    ordem: 1,
    autor: seeded.perfilMaker,
  }),
  progressoAula: ({ userId, seeded }) => ({
    // `attributeProgressToRequester` leaves this alone when the write carries no session,
    // which is exactly how the harness writes — the hook documents this fixture by name.
    usuario: userId,
    aula: seeded.aula,
    percentualAssistido: 50,
  }),
  local: ({ marker }) => ({ nome: `Sala ${marker}` }),
  maquina: ({ marker }) => ({ nome: `Impressora ${marker}` }),
  evento: ({ marker, seeded }) => ({
    titulo: `Evento ${marker}`,
    slug: `evento-${marker}`,
    tipo: 'oficina',
    descricaoCurta: `Evento de fixture ${marker}.`,
    inicioEm: '2026-10-01T13:00:00.000Z',
    fimEm: '2026-10-01T16:00:00.000Z',
    local: seeded.local,
    responsavel: seeded.perfilMaker,
  }),
  curtida: ({ userId, seeded }) => ({
    usuario: userId,
    conteudo: { relationTo: 'projeto', value: seeded.projeto },
  }),
}

/** Minimal valid data for a scoped collection, so the matrix grows without editing this. */
function seedDataFor(
  collection: string,
  marker: string,
  userId: string | number,
  seeded: Record<string, string | number>,
): Record<string, unknown> {
  const build = SEED_DATA[collection]
  if (!build) {
    throw new Error(
      `fixtures.ts has no seed data for scoped collection "${collection}". ` +
        `Add it — otherwise the isolation harness silently skips that collection.`,
    )
  }
  return build({ marker, userId, seeded })
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
      author: { id: string | number },
      seeded: Record<string, string | number>,
      host: string,
    ) =>
      (await payload.create({
        collection: collection as never,
        data: { ...seedDataFor(collection, marker, author.id, seeded), tenant } as never,
        overrideAccess: true,
        // **The request is load-bearing, not decoration**, and it carries two things.
        //
        // The *host*, because a collection hook may read through the choke point on save —
        // `modelo3d`'s `deriveFormatos` does — and `getTenantScopedPayload` resolves its
        // organization from `x-tenant-host`, throwing `TenantUnresolvedError` when there is
        // none. `createLocalReq` keeps the headers it is handed, so a Local API seed can
        // still name the tenant the hook will read as.
        //
        // The *user*, because that same client reads with `overrideAccess: false` — the
        // whole point of the choke point — so a hook reading on behalf of nobody is refused
        // with `Forbidden` (measured: seeding `modelo3d` failed in `executeAccess`, not in
        // the fixture). `overrideAccess: true` above still applies to the create itself;
        // this only gives the hook's own read an identity, and it is the identity that
        // organization's rows belong to.
        req: { headers: new Headers({ 'x-tenant-host': host }), user: author } as never,
      })) as unknown as { id: string | number }

    const seededFor = (marker: 'A' | 'B'): Record<string, string | number> =>
      Object.fromEntries(Object.entries(rows).map(([slug, ids]) => [slug, ids[marker]]))

    const rowA = await create('A', a.id, userA, seededFor('A'), 'org-a.localhost')
    const rowB = await create('B', b.id, userB, seededFor('B'), 'org-b.localhost')
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
