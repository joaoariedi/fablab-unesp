import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T036 / FR-017, SC-009, US5 — **adding a skill puts it on EVERY maker's panel, at level 0.**
 *
 * FR-017's whole content is the word *"not only to new ones"*: `lib/accounts/signup.ts`
 * already assigns the active catalogue at level 0 to a profile it is creating (FR-013), so a
 * maker who signs up **after** `Serigrafia` exists is served by code that shipped with 004.
 * The maker this requirement is about is the one who signed up **before** — nothing in the
 * signup path ever runs again for them, so without a hook on the catalogue their panel is
 * missing a skill the lab offers, silently and forever.
 *
 * SC-009 names the shape of its own evidence — *"an integration test"* — and it has to be one:
 * the claim is about what a write to `skill` does to rows in **another table** that the write
 * does not name, through access control and the tenant filter. A config-shape assertion could
 * only say that a hook is registered, which is the thing least likely to be wrong.
 *
 * **What each fixture maker is for**, because "every maker" is exactly the kind of claim a
 * single-subject test proves vacuously:
 *
 *   - **Ana** signed up when the catalogue held one skill and has real progress in it. She is
 *     the assertion that the new row is *appended* — a fan-out that rebuilt the panel from the
 *     catalogue would give her the two rows this test expects while erasing her level, and
 *     nothing else in the tree would notice until she opened Minha Conta.
 *   - **Bruno** carries no panel at all (`skills` never written). A profile whose array is
 *     absent rather than empty is what the tenancy fixtures and the seed produce, and it is
 *     the case an implementation written against `panel.map(...)` alone gets wrong.
 *   - **Carla** is a maker of a **different lab**. FR-029 and the choke point say the fan-out
 *     stops at the organization boundary; the skill she must not receive is one she cannot
 *     even see, and a broad client would hand it to her with no error anywhere.
 *
 * §2 pins the other half of the decision: a skill created **inactive** assigns nothing. That is
 * not an omission — `skillsAoNivelZero` filters `ativa: true` for every new profile (FR-013),
 * so assigning an inactive skill here would make the two paths disagree about the same
 * catalogue, and FR-019 keeps a deactivated skill off the panel anyway.
 *
 * The world is two sentinel organizations of this file's own, torn down in `afterAll`:
 * `counters.test.ts` reconciles the WHOLE database, so a row left behind fails somebody else's
 * file (measured in 004 phase 6).
 */

const SLUG = 't036-skill'
const SLUG_VIZINHO = 't036-vizinho'
const HOST = `${SLUG}.localhost`
const HOST_VIZINHO = `${SLUG_VIZINHO}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>
/** One row of the SUAS SKILLS panel, as stored at `depth: 0`. */
type LinhaPainel = { id?: unknown; skill?: unknown; nivel?: unknown; xp?: unknown }

let payload: Payload
let tenant: string | number
let tenantVizinho: string | number
let equipe: Linha
let equipeVizinha: Linha
/** The catalogue as it stood before the act — Ana holds a level in it. */
let skillAntiga: Linha
/** The act under test: the skill nobody's profile predates. */
let skillNova: Linha
/** §2's subject: added with `ativa: false`, so nobody receives it. */
let skillInativa: Linha
/** Ana's row for `skillAntiga`, exactly as stored before the act. */
let linhaDaAnaAntes: LinhaPainel | undefined

/**
 * A request carrying the two things a write here needs: the **host**, because the hook under
 * test reaches Payload through `getTenantScopedPayload`, which resolves the organization from
 * `x-tenant-host`; and the **user**, because that client reads with `overrideAccess: false`
 * and a hook acting for nobody is refused in `executeAccess`.
 */
const pedido = (host: string, user: Linha) =>
  ({ headers: new Headers({ 'x-tenant-host': host }), user }) as never

const criar = async (
  collection: string,
  data: Documento,
  onde: { tenant: string | number; host: string; user: Linha } = {
    tenant,
    host: HOST,
    user: equipe,
  },
): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant: onde.tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(onde.host, onde.user),
  })) as unknown as Linha

const conta = async (sufixo: string, org: string | number): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never` for `criar`'s reason: `tenant` is `string | number` because a database need
      // not use integers, while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: org, role: 'admin' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

/** A maker's stored profile, by handle, past access control. */
const perfilPorHandle = async (handle: string): Promise<Documento> => {
  const { docs } = await payload.find({
    collection: 'perfilMaker',
    where: { handle: { equals: handle } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const perfil = (docs as unknown as Documento[])[0]
  if (!perfil) throw new Error(`no perfilMaker ${handle} on this database — the fixture never built it`)
  return perfil
}

const painelDe = async (handle: string): Promise<LinhaPainel[]> =>
  ((await perfilPorHandle(handle)).skills as LinhaPainel[] | undefined) ?? []

/** This maker's row for one skill, or `undefined` when the panel carries none. */
const linhaDoPainel = (painel: LinhaPainel[], skill: Linha): LinhaPainel | undefined =>
  painel.find((linha) => String(linha.skill) === String(skill.id))

/** The row's values, with the skill normalised to a string — ids differ in type by depth. */
const valores = (linha: LinhaPainel | undefined) =>
  linha === undefined
    ? undefined
    : { skill: String(linha.skill), nivel: linha.nivel, xp: linha.xp }

const limpar = async () => {
  // Reverse dependency order: deleting forwards removes a row while its referrer still points
  // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld). `skill` is
  // referenced by the makers' panels, so it goes only once those are gone.
  const orgs = await payload.find({
    collection: 'organizations',
    where: { slug: { in: [SLUG, SLUG_VIZINHO] } },
    depth: 0,
    limit: 10,
    overrideAccess: true,
  })
  for (const org of orgs.docs) {
    for (const collection of ['perfilMaker', 'skill', 'regrasXp']) {
      await payload.delete({
        collection: collection as never,
        where: { tenant: { equals: org.id } } as never,
        overrideAccess: true,
      })
    }
  }
  // Before the organizations, and after the profiles that name them: `users_orgs.organization_id`
  // is NOT NULL and Postgres nulls it on the organization's delete, so an account outliving its
  // lab fails the teardown with `23502` — measured here, on the first run of this file.
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${SLUG}-%` } },
    overrideAccess: true,
  })
  for (const org of orgs.docs) {
    await payload.delete({ collection: 'organizations', id: org.id, overrideAccess: true })
  }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await limpar()

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T036', slug: SLUG, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id
  const vizinha = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab vizinho T036', slug: SLUG_VIZINHO, status: 'active' },
    overrideAccess: true,
  })
  tenantVizinho = vizinha.id

  // Created before `pedido()` is ever called: every seed below travels as one of these.
  equipe = await conta('equipe', tenant)
  equipeVizinha = await conta('equipe-vizinha', tenantVizinho)

  // The catalogue the two makers of this lab signed up against — one skill, and Ana has a
  // level in it.
  skillAntiga = await criar('skill', {
    nome: 'Modelagem 3D',
    slug: 'modelagem-3d-t036',
    ativa: true,
  })

  await criar('perfilMaker', {
    nome: 'Ana T036',
    handle: '@anat036',
    usuario: (await conta('ana', tenant)).id,
    skills: [{ skill: skillAntiga.id, nivel: 3, xp: 17 }],
  })
  // No `skills` key at all — the shape the tenancy fixtures and the seed produce.
  await criar('perfilMaker', {
    nome: 'Bruno T036',
    handle: '@brunot036',
    usuario: (await conta('bruno', tenant)).id,
  })
  await criar(
    'perfilMaker',
    {
      nome: 'Carla T036',
      handle: '@carlat036',
      usuario: (await conta('carla', tenantVizinho)).id,
    },
    { tenant: tenantVizinho, host: HOST_VIZINHO, user: equipeVizinha },
  )

  linhaDaAnaAntes = linhaDoPainel(await painelDe('@anat036'), skillAntiga)

  // The act under test: the lab's team adds a skill to a catalogue two makers predate.
  skillNova = await criar('skill', { nome: 'Serigrafia', slug: 'serigrafia-t036', ativa: true })
  // §2's act, in the same fixture: a skill that enters the catalogue already retired.
  skillInativa = await criar('skill', { nome: 'Torno', slug: 'torno-t036', ativa: false })
}, 120_000)

afterAll(async () => {
  await limpar()
})

describe('§1 — a new skill enters every maker of this lab at level 0 (T036, FR-017, SC-009)', () => {
  it('the fixture is non-trivial: Ana held a real level before the skill was added', () => {
    expect(
      valores(linhaDaAnaAntes),
      'Ana has no level in the old skill, so "the new row was appended beside hers" would be ' +
        'checking that an empty panel stayed empty — the vacuous shape tasks.md warns about',
    ).toEqual({ skill: String(skillAntiga.id), nivel: 3, xp: 17 })
  })

  it('gives it to a maker who signed up before it existed, at level 0 and 0 XP', async () => {
    expect(
      valores(linhaDoPainel(await painelDe('@anat036'), skillNova)),
      'Ana signed up before Serigrafia existed and her panel still does not carry it. FR-017 ' +
        'is exactly this case — signup assigns the catalogue only to profiles it creates, so ' +
        'nothing ever runs again for a maker who was already there',
    ).toEqual({ skill: String(skillNova.id), nivel: 0, xp: 0 })
  })

  it('appends it, leaving the level she already held untouched', async () => {
    const linha = linhaDoPainel(await painelDe('@anat036'), skillAntiga)

    expect(
      { ...valores(linha), id: linha?.id },
      'her row for the old skill moved. A fan-out that rebuilds the panel from the catalogue ' +
        'satisfies FR-017 while erasing every level on it, and the ledger it disagrees with is ' +
        'append-only, so nothing raises an error — the panel is simply wrong from then on',
    ).toEqual({ ...valores(linhaDaAnaAntes), id: linhaDaAnaAntes?.id })
  })

  it('gives it to a maker whose panel was never written at all', async () => {
    const painel = await painelDe('@brunot036')

    expect(
      painel.map(valores),
      'Bruno carries no `skills` array — the shape the fixtures and the seed produce — and an ' +
        'implementation that maps over the stored panel without appending to an absent one ' +
        'leaves him out of the catalogue his lab offers',
    ).toEqual([{ skill: String(skillNova.id), nivel: 0, xp: 0 }])
  })

  it('never crosses the lab boundary — the neighbour lab gains nothing', async () => {
    expect(
      await painelDe('@carlat036'),
      'a maker of another organization received this lab\'s skill. The fan-out must go through ' +
        'the choke point, whose tenant filter is what confines it; a broader client hands her ' +
        'a row naming a catalogue she cannot even read (FR-029)',
    ).toEqual([])
  })
})

describe('§2 — a skill added already retired assigns nothing (FR-019, FR-013)', () => {
  it('reached neither maker of this lab', async () => {
    const painel = [...(await painelDe('@anat036')), ...(await painelDe('@brunot036'))]

    expect(
      painel.filter((linha) => String(linha.skill) === String(skillInativa.id)),
      'an inactive skill was assigned. `skillsAoNivelZero` gives a NEW profile only the active ' +
        'catalogue (FR-013), so assigning it here makes the two paths disagree about the same ' +
        'catalogue — and FR-019 keeps a deactivated skill off the panel anyway',
    ).toEqual([])
  })
})

/**
 * §3 — **the hole §2 leaves open**, and the reason §2 alone is not the whole of FR-017.
 *
 * *"Not only to new ones"* is the requirement's own phrase, and §2 is only defensible while
 * switching the skill on later reaches everybody. It did not: `assignNewSkillToEveryMaker`
 * answers `create`, and the reactivation hook beside it calls `recomputeSkillPanels`, which is
 * bounded by the makers the **ledger** says earned in that skill — nobody, for a skill that has
 * never been active. So one admin click apart, a skill created retired and then published
 * reached every maker who signed up **afterwards** (signup reads the active catalogue) and no
 * maker who already existed, permanently and silently: the panel renders from the stored rows,
 * so a missing row is the skill simply absent from that person's account forever, and FR-011's
 * gate cannot see it because a level-0 row carries no XP to disagree about.
 *
 * That is the exact asymmetry FR-017 exists to forbid, inverted — the pre-existing maker is the
 * one left out either way.
 */
describe('§3 — publishing a retired skill reaches the makers who were already here (FR-017)', () => {
  it('gives the level-0 row to a maker who signed up before it was switched on', async () => {
    const antes = await painelDe('@anat036')
    expect(
      linhaDoPainel(antes, skillInativa),
      'Ana already carries the retired skill, so §2 no longer holds and the activation below ' +
        'would be asserting against a row that was there all along',
    ).toBeUndefined()

    await payload.update({
      collection: 'skill',
      id: skillInativa.id,
      data: { ativa: true } as never,
      overrideAccess: true,
      req: pedido(HOST, equipe),
    })

    expect(
      valores(linhaDoPainel(await painelDe('@anat036'), skillInativa)),
      'a retired skill was published and a maker who was already here never received it. ' +
        'Everyone who signs up from now on does — `skillsAoNivelZero` reads the ACTIVE ' +
        'catalogue — so the lab ends up with two classes of maker in one catalogue, and no ' +
        'later path ever repairs it',
    ).toEqual({ skill: String(skillInativa.id), nivel: 0, xp: 0 })
  })

  it('reaches the second maker too, and still does not cross the lab boundary', async () => {
    expect(valores(linhaDoPainel(await painelDe('@brunot036'), skillInativa))).toEqual({
      skill: String(skillInativa.id),
      nivel: 0,
      xp: 0,
    })

    // The neighbour lab is the control: a repair that walked every profile in the database
    // rather than this lab's roster would satisfy both cases above and leak the catalogue.
    expect(
      linhaDoPainel(await painelDe('@carlat036'), skillInativa),
      "the neighbouring lab's maker received this lab's skill",
    ).toBeUndefined()
  })
})
