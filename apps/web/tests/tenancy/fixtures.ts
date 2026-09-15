import { levelFor } from '@fablab/game'
import { getPayload, type Payload } from 'payload'

import config from '../../payload.config'
import { REGRAS_XP_CITE } from '../../collections/content/RegrasXp'
import { SEED_ON_CREATE } from '../../lib/tenancy/seed-on-create'
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
  // The one scoped collection feature 004 adds (T008), in registry order — ahead of
  // `perfilMaker`, which T009 gives a `skills` array pointing here. `ativa` is written
  // explicitly rather than left to its `defaultValue`: the column is `required: true`, which
  // on a checkbox means "must carry a boolean", and a fixture that relied on the default
  // would stop exercising that guarantee the day somebody removed it.
  skill: ({ marker }) => ({
    nome: `Skill ${marker}`,
    // Not `unique` on the collection, so both organizations may hold the same slug; the
    // marker is what makes a failure message name WHICH organization's row leaked.
    slug: `skill-${marker.toLowerCase()}`,
    ativa: true,
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
  // The 005 economy (T009), in registry order — both at the end, `regrasXp` first.
  //
  // The three tunables are written from `REGRAS_XP_CITE` rather than left to their
  // `defaultValue`s: each column is `required: true`, and a fixture leaning on the default
  // would stop exercising that the day somebody removed it. Importing the constant is what
  // keeps this row from becoming a second, drifting copy of the CITe seed (CLR-010).
  regrasXp: () => ({ ...REGRAS_XP_CITE }),
  // The two T028 registers, in registry order — between `regrasXp` and `xpLedger`. Every
  // relationship points at the row seeded into THIS organization, because `sameTenant` refuses
  // anything else and a refusal here aborts `beforeAll` for the whole directory.
  missao: ({ marker, seeded }) => ({
    titulo: `Missão ${marker}`,
    descricao: `Missão de fixture ${marker}.`,
    icone: seeded.midiaImagem,
    skill: seeded.skill,
    // `publicado`, spelled exactly as `derivePublishable`'s filter spells it, and written out
    // rather than left to the `defaultValue`: the column is `required: true`, and a fixture
    // leaning on the default stops exercising that the day somebody removes it. A `rascunho`
    // row would also be invisible to every published-only read, so an assertion about a
    // mission being listed would pass by finding nothing.
    status: 'publicado',
  }),
  // One row per (mission, maker) — the unique index of FR-023 — so the marker's own mission and
  // the marker's own profile are what it names. `comprovante` is a `midiaImagem` id and never a
  // key, a URL or a filename (CLR-006, FR-036); `status` is the state a submission is born in,
  // written explicitly for the same reason `missao.status` is.
  missaoSubmissao: ({ seeded }) => ({
    missao: seeded.missao,
    maker: seeded.perfilMaker,
    comprovante: seeded.midiaImagem,
    status: 'enviada',
  }),
  // A real credit rather than a bare row: `perfil` and `skill` are under `sameTenant`, so both
  // must be the ones seeded into THIS organization, and `refTipo`/`refId` are scalars naming
  // the project seeded above — which is what makes the entry reconstructable the way SC-019
  // asks. `chaveIdempotencia` is composed by the collection's own `beforeValidate`; writing it
  // here would test the fixture's copy of that rule instead of the collection's.
  xpLedger: ({ seeded }) => ({
    perfil: seeded.perfilMaker,
    skill: seeded.skill,
    acao: 'publicar_projeto',
    refTipo: 'projeto',
    // `number`, because the column is: a serial id, never the string form of one.
    refId: Number(seeded.projeto),
    quantidade: REGRAS_XP_CITE.xpPorAcao,
  }),
}

/**
 * Minimal valid data for a scoped collection, so the matrix grows without editing this.
 *
 * **Exported so the gap can be caught before `beforeAll` swallows it.** The throw below is
 * the right behaviour inside `buildWorld`, but a throw in `beforeAll` aborts the file and
 * reports its tests as *skipped* rather than failed — 160 tests went quiet that way in 002.
 * `avatar-registry.test.ts` calls this directly, with no database, so a scoped collection
 * added without seed data fails one assertion loudly instead of silencing a suite.
 *
 * @example seedDataFor('skill', 'A', userId, {}) // { nome: 'Skill A', slug: 'skill-a', … }
 */
export function seedDataFor(
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

/**
 * Collections `SEED_ON_CREATE` writes when an organization is created.
 *
 * The fixture **adopts** these rather than creating its own, because they are singletons per
 * organization and a second row breaks the invariant their collection states. Derived from the
 * seed registry rather than hand-listed, so a seed added in a later feature is covered the day
 * it lands instead of the day somebody remembers this file.
 */
const SEMEADAS_NA_CRIACAO = new Set(SEED_ON_CREATE.map((seed) => seed.collection))

/**
 * The counters a seeded row is the SOURCE of, and the column that stores the count.
 *
 * `curtidas` is maintained in production by `lib/accounts/curtir.ts` and by the erasure path,
 * never by a hook on `curtida` — so a fixture that writes the row directly writes no count.
 *
 * `totalModelos` is maintained by **nothing at all**: `CategoriaModelo.ts` declares it derived
 * and `syncCounter` has no caller that writes it. That is a gap in the application rather than
 * in this fixture, and it is recorded here because this is where it becomes visible — a world
 * seeded with one `modelo3d` per organization leaves both categories reading zero.
 */
const CONTAGENS_SEMEADAS = [
  // Polymorphic, so the target is addressed as `conteudo.value` — the same path the
  // reconciliation in `tests/content/counters.test.ts` declares for it.
  { alvo: 'projeto', campo: 'curtidas', de: 'curtida', por: 'conteudo.value' },
  { alvo: 'categoriaModelo', campo: 'totalModelos', de: 'modelo3d', por: 'categoria' },
] as const

/**
 * Brings the seeded world's derived columns into agreement with the rows that feed them.
 *
 * **Why a world needs this at all.** `buildWorld` creates one row per scoped collection with
 * `overrideAccess: true`, in registry order — which means it bypasses the server actions that
 * maintain derived columns, and that a row storing a count is created *before* the row it
 * counts. A profile cannot know at creation about the `xpLedger` entry seeded several
 * collections later; a project cannot know about the `curtida` that arrives after it. The world
 * that results is a state the application itself could never produce: every derived column in
 * it reads zero while its sources say otherwise.
 *
 * **It was measured, not anticipated.** `counters.test.ts` reconciles the WHOLE database and
 * reported eight drifts against a freshly built world — `xpTotal` and a missing `skills[]` row
 * on both profiles, `curtidas` on both projects, `totalModelos` on both categories. It surfaces
 * in the *content* leg rather than the tenancy one because `resetWorld` runs when a world is
 * BUILT and never when one is torn down: a world outlives its run, and the next run's content
 * files reconcile it before any tenancy file rebuilds it. CI never saw it — there the content
 * leg runs first, against a database where no world has been built yet.
 *
 * **Recomputed from the rows, never written as literals.** `levelFor` and the seeded economy are
 * the authorities on what one entry is worth; a `nivel: 0` here would be a second copy of the
 * curve to retune, which is the whole reason no column declares a `max` (CLR-013).
 */
async function sincronizarDerivadosSemeados(payload: Payload, rows: Fixture['rows']): Promise<void> {
  const contar = async (collection: string, where: Record<string, unknown>): Promise<number> => {
    // `limit: 1` and `totalDocs`: the count is what is wanted, and paging the rows in to
    // measure their length is how a recount stops short of its own source.
    const { totalDocs } = await payload.find({
      collection: collection as never,
      where: where as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    return totalDocs
  }

  for (const marker of ['A', 'B'] as const) {
    for (const { alvo, campo, de, por } of CONTAGENS_SEMEADAS) {
      const id = rows[alvo]?.[marker]
      if (id === undefined) continue
      await payload.update({
        collection: alvo as never,
        id,
        data: { [campo]: await contar(de, { [por]: { equals: id } }) } as never,
        overrideAccess: true,
      })
    }

    const perfil = rows.perfilMaker?.[marker]
    if (perfil === undefined) continue

    const { docs } = await payload.find({
      collection: 'xpLedger',
      where: { perfil: { equals: perfil } } as never,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    })
    const entradas = docs as unknown as { skill?: string | number | null; quantidade?: number }[]

    const somar = (total: number, { quantidade }: { quantidade?: number }) =>
      total + (typeof quantidade === 'number' ? quantidade : 0)
    const xpTotal = entradas.reduce(somar, 0)

    // Grouped rather than assumed to be one entry: the seed writes a single one today, and a
    // second added later must not silently stop being projected.
    const porSkill = new Map<string | number, number>()
    for (const entrada of entradas) {
      const { skill } = entrada
      // An entry naming no skill credits the total and no skill (FR-039) — it belongs in
      // `xpTotal` above and in no panel row.
      if (skill === null || skill === undefined) continue
      porSkill.set(skill, somar(porSkill.get(skill) ?? 0, entrada))
    }

    await payload.update({
      collection: 'perfilMaker',
      id: perfil,
      // `as never` for the reason the seeding `create` above writes it the same way: ids in
      // `Fixture['rows']` are `string | number` because a database need not use integers, while
      // the generated `PerfilMaker` narrows `skill` to this database's own `number`. Widening
      // the fixture to match a generated type would make it a statement about Postgres.
      data: {
        xpTotal,
        nivel: levelFor(xpTotal, REGRAS_XP_CITE),
        skills: [...porSkill].map(([skill, xp]) => ({
          skill,
          xp,
          nivel: levelFor(xp, REGRAS_XP_CITE),
        })),
      } as never,
      overrideAccess: true,
    })
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

    // **A collection `SEED_ON_CREATE` already wrote is ADOPTED, never created a second time.**
    //
    // `regrasXp` is a singleton per organization — its own docblock says the row *"arrives
    // exactly once"* and that *"every reader asks this collection one question and expects one
    // answer"*. Creating a fixture row beside the one `seedNewOrganization` wrote gave each
    // organization TWO economies, and `creditXp` would have read whichever came first.
    //
    // Measured, not theorised: it turned `isolation.test.ts`'s graphql vantage point red with
    // *"a surface disclosed row 871, which this fixture did not seed"* — 871 and 873 both
    // belonging to organization A. The row was never leaked; there were simply two of it. The
    // other three vantage points passed, which is why running the WHOLE directory is the rule.
    const adopt = async (tenant: string | number): Promise<{ id: string | number }> => {
      const { docs } = await payload.find({
        collection: collection as never,
        where: { tenant: { equals: tenant } } as never,
        limit: 2,
        depth: 0,
        overrideAccess: true,
      })
      if (docs.length !== 1) {
        throw new Error(
          `${collection} is seeded on organization creation, so exactly one row should exist ` +
            `for tenant ${String(tenant)} — found ${String(docs.length)}. Either the seed ran ` +
            `twice, or it did not run at all and this fixture has nothing to adopt.`,
        )
      }
      return docs[0] as unknown as { id: string | number }
    }

    const rowA = SEMEADAS_NA_CRIACAO.has(collection)
      ? await adopt(a.id)
      : await create('A', a.id, userA, seededFor('A'), 'org-a.localhost')
    const rowB = SEMEADAS_NA_CRIACAO.has(collection)
      ? await adopt(b.id)
      : await create('B', b.id, userB, seededFor('B'), 'org-b.localhost')
    rows[collection] = { A: rowA.id, B: rowB.id }
  }

  await sincronizarDerivadosSemeados(payload, rows)

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
