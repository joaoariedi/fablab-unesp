import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T037 / FR-018, US4 — **a skill the ledger names cannot be hard-deleted, and the refusal says
 * how many entries exist.**
 *
 * The product behaviour for "remove a skill" is `ativa: false` (FR-015): the ledger is
 * untouched, nobody's total moves, and reactivating restores every level from it (FR-016). That
 * whole design rests on the row surviving — an `xpLedger` entry names a skill by id, so deleting
 * the row turns every entry that credited it into history nobody can read back, and
 * `recomputeSkillPanels` has nothing left to restore.
 *
 * **Postgres does not stop it, and the schema is where that is visible.** Read from the
 * committed migrations:
 *
 *   - `xp_ledger.skill_id` → `ON DELETE set null` (`20260914_173408_economia_xp_005.ts:36`),
 *     because FR-039 makes the column nullable — content that names no skill still credits the
 *     total. So the delete **succeeds** and empties the column on every entry that credited it.
 *     No error, no total moved, nothing for FR-011's reconciliation gate to notice: it compares
 *     projections against the ledger, and the ledger still holds the same XP.
 *   - `perfil_maker_skills.skill_id` → `ON DELETE restrict`
 *     (`20260912_025334_contas_avatar_004.ts:101`), so a skill sitting on *some* maker's panel
 *     is refused by the database — with `Failed query: delete from "skill" where …`, which names
 *     no count, no skill and no reason an admin could act on. Measured here on this file's first
 *     run, which is why §2 exists as a case of its own.
 *
 * §1 is therefore the silent loss (no panel row: the delete goes through) and §2 is the same
 * refusal arriving **before** the database's, so the admin reads a sentence instead of SQL.
 *
 * **Why the count is part of the requirement rather than decoration.** A bare "não é possível
 * apagar" tells the admin nothing about what they are about to lose, and an admin who believes
 * the skill is unused has no way to find out otherwise from the admin panel — the ledger's list
 * view is scoped to the lab, not to one skill. The number is the evidence.
 *
 * The fixture is built so a guard that forgot the per-skill filter cannot pass: this lab's
 * ledger holds **seven** entries, of which two name §1's subject and three name §2's. A refusal
 * saying "7" is as wrong as one saying nothing.
 *
 * §3 is what keeps the guard from being "delete is always refused": a skill no entry has ever
 * named — a typo in the catalogue, added and removed the same afternoon — still deletes.
 *
 * The world is one sentinel organization of this file's own, torn down in `afterAll`:
 * `counters.test.ts` reconciles the WHOLE database, so a row left behind fails somebody else's
 * file (measured in 004 phase 6).
 */

const SLUG = 't037-skill'
const HOST = `${SLUG}.localhost`
/** §4's other lab: where a master happens to be browsing when they reach for this lab's skill. */
const SLUG_VIZINHO = 't037-skill-vizinho'
const HOST_VIZINHO = `${SLUG_VIZINHO}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
let tenantVizinho: string | number
let equipe: Linha
/** A `master`: the role this codebase designs for cross-tenant admin, and §4's actor. */
let mestre: Linha
/** §1's subject: two ledger entries name it, and no maker's panel does. */
let skillCreditada: Linha
/** §2's subject: three entries name it, and it also sits on a maker's panel. */
let skillNoPainel: Linha
/** §3's subject: nothing in the ledger has ever named it. */
let skillIntocada: Linha
/** Named by a seventh entry — the row that makes a count without a skill filter say 7. */
let skillVizinha: Linha

/**
 * A request carrying the two things the guard needs: the **host**, because the hook reaches
 * Payload through `getTenantScopedPayload`, which resolves the organization from
 * `x-tenant-host`; and the **user**, because that client reads with `overrideAccess: false`
 * and a hook acting for nobody is refused in `executeAccess`.
 */
const pedido = (user: Linha, host: string = HOST) =>
  ({ headers: new Headers({ 'x-tenant-host': host }), user }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(equipe),
  })) as unknown as Linha

const conta = async (sufixo: string): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never` for `criar`'s reason: `tenant` is `string | number` because a database need
      // not use integers, while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role: 'admin' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

/** How many rows of a collection exist in this lab, past access control. */
const quantas = async (collection: string, where: Documento): Promise<number> =>
  (
    await payload.find({
      collection: collection as never,
      where: { and: [{ tenant: { equals: tenant } }, where] } as never,
      limit: 0,
      depth: 0,
      overrideAccess: true,
    })
  ).totalDocs

/** The delete an admin of this lab performs from the admin panel — access control included. */
const apagarComoEquipe = (skill: Linha) =>
  payload.delete({
    collection: 'skill',
    id: skill.id as never,
    overrideAccess: false,
    user: equipe as never,
    req: pedido(equipe),
  })

/** The message of whatever a delete threw, or `null` when it did not throw at all. */
const recusaAoApagar = async (skill: Linha): Promise<string | null> => {
  try {
    await apagarComoEquipe(skill)
    return null
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro)
  }
}

/** The delete §4 drives: any account, from any lab's host, through access control. */
const tentarApagar = async (
  skill: Linha,
  quem: { user: Linha; host: string },
): Promise<string | null> => {
  try {
    await payload.delete({
      collection: 'skill',
      id: skill.id as never,
      overrideAccess: false,
      user: quem.user as never,
      req: pedido(quem.user, quem.host),
    })
    return null
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro)
  }
}

/** The ledger entries still naming one skill, read across every lab — the orphaning is the point. */
const entradasDaSkill = async (skill: Linha): Promise<Documento[]> =>
  (
    await payload.find({
      collection: 'xpLedger',
      where: { skill: { equals: skill.id } },
      depth: 0,
      limit: 100,
      overrideAccess: true,
    })
  ).docs as unknown as Documento[]

const limpar = async () => {
  // Reverse dependency order: deleting forwards removes a row while its referrer still points
  // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld). `skill` is
  // referenced by the ledger entries and by the maker's panel, so it goes only once both are
  // gone — which is also what keeps this teardown legal under the guard this file installs.
  const orgs = await payload.find({
    collection: 'organizations',
    where: { slug: { in: [SLUG, SLUG_VIZINHO] } },
    depth: 0,
    limit: 10,
    overrideAccess: true,
  })
  for (const org of orgs.docs) {
    for (const collection of ['xpLedger', 'perfilMaker', 'skill', 'regrasXp']) {
      await payload.delete({
        collection: collection as never,
        where: { tenant: { equals: org.id } } as never,
        overrideAccess: true,
      })
    }
  }
  // Before the organization, and after the profile that names it: `users_orgs.organization_id`
  // is NOT NULL and Postgres nulls it on the organization's delete, so an account outliving its
  // lab fails the teardown with `23502` (skill-nivel-zero.test.ts, measured).
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
    data: { name: 'Lab T037', slug: SLUG, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id
  equipe = await conta('equipe')

  // §4's world: a second lab, and a master whose memberships name it rather than this one. The
  // master is not a member of the lab whose skill they delete — that is the whole point of the
  // role, and `userHasAccessToAllTenants: isMaster` in payload.config.ts is what grants it.
  const vizinha = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T037 vizinho', slug: SLUG_VIZINHO, status: 'active' },
    overrideAccess: true,
  })
  tenantVizinho = vizinha.id
  mestre = (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG}-mestre@example.com`,
      password: SENHA,
      role: 'master',
      orgs: [{ organization: tenantVizinho, role: 'admin' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

  skillCreditada = await criar('skill', {
    nome: 'Corte a Laser',
    slug: 'corte-a-laser-t037',
    ativa: true,
  })
  skillNoPainel = await criar('skill', {
    nome: 'Impressão 3D',
    slug: 'impressao-3d-t037',
    ativa: true,
  })
  skillVizinha = await criar('skill', { nome: 'Torno', slug: 'torno-t037', ativa: true })
  skillIntocada = await criar('skill', { nome: 'Design', slug: 'design-t037', ativa: true })

  const maker = await criar('perfilMaker', {
    nome: 'Maker T037',
    handle: '@makert037',
    usuario: (await conta('maker')).id,
    // Only §2's subject is on the panel. §1's is deliberately absent, because
    // `perfil_maker_skills.skill_id` is `ON DELETE restrict`: a panel row would have the
    // DATABASE refuse the delete, and the test would pass with no guard written at all.
    skills: [{ skill: skillNoPainel.id, nivel: 2, xp: 5 }],
  })

  // Seven entries: two name §1's subject, three name §2's, one names a third skill and one names
  // none at all (FR-039). A guard that counted the lab's ledger instead of this skill's would
  // report 7 for both; one that counted nothing would report 0.
  const entradas = [
    { skill: skillCreditada.id, refId: 1 },
    { skill: skillCreditada.id, refId: 2 },
    { skill: skillNoPainel.id, refId: 3 },
    { skill: skillNoPainel.id, refId: 4 },
    { skill: skillNoPainel.id, refId: 5 },
    { skill: skillVizinha.id, refId: 6 },
    { skill: null, refId: 7 },
  ]
  for (const entrada of entradas) {
    await criar('xpLedger', {
      perfil: maker.id,
      skill: entrada.skill,
      acao: 'publicar_projeto',
      refTipo: 'projeto',
      // Distinct per entry: `chaveIdempotencia` is composed from the tuple and carries a unique
      // index, so two entries sharing a `refId` would be one entry and a 23505.
      refId: entrada.refId,
      quantidade: 1,
    })
  }
}, 120_000)

afterAll(async () => {
  await limpar()
})

describe('§1 — a skill the ledger names is not deletable (T037, FR-018)', () => {
  it('the fixture is non-trivial: the two subjects hold 2 and 3 of seven entries', async () => {
    expect(
      [
        await quantas('xpLedger', { skill: { equals: skillCreditada.id } }),
        await quantas('xpLedger', { skill: { equals: skillNoPainel.id } }),
        await quantas('xpLedger', { id: { exists: true } }),
      ],
      'the ledger does not hold the 2 / 3 / 7 shape this file asserts against, so "the refusal ' +
        'names the count" would be checking a number that is also the total — a guard that ' +
        'forgot the per-skill filter would pass',
    ).toEqual([2, 3, 7])
  })

  it('refuses the delete, naming how many entries exist', async () => {
    expect(
      // `??` rather than the bare result: a delete that went through returns `null`, and
      // `toMatch(null)` reports a TypeError about its own argument instead of what happened.
      (await recusaAoApagar(skillCreditada)) ?? 'a exclusão foi concluída, sem recusa nenhuma',
      'the skill was hard-deleted, or the refusal did not name the 2 entries behind it. ' +
        '`xp_ledger.skill_id` is ON DELETE set null (FR-039 makes the column nullable), so ' +
        'Postgres does not object — it empties the column on every entry that credited this ' +
        'skill and the history of what was earned in it becomes unreadable, with no error and ' +
        'no total moved for anything downstream to notice',
    ).toMatch(/\b2 registros de XP\b/)
  })

  it('leaves the skill itself in the catalogue', async () => {
    expect(
      await quantas('skill', { id: { equals: skillCreditada.id } }),
      'the refusal did not actually stop the delete — a guard that throws after Payload has ' +
        'removed the row reports an error and loses the data anyway',
    ).toBe(1)
  })

  it('leaves every entry that credited it pointing at it', async () => {
    expect(
      await quantas('xpLedger', { skill: { equals: skillCreditada.id } }),
      'the entries no longer name the skill. This is the loss FR-018 exists to prevent, and it ' +
        'is silent: the ledger keeps the XP, so no total moves and no reconciliation gate fires',
    ).toBe(2)
  })
})

describe('§2 — the refusal arrives before the database\'s (T037, FR-018)', () => {
  it('names the three entries rather than failing as a raw query', async () => {
    const recusa = await recusaAoApagar(skillNoPainel)

    // `perfil_maker_skills.skill_id` is ON DELETE restrict, so this delete fails either way.
    // What FR-018 asks for is WHICH failure the admin reads: `Failed query: delete from
    // "skill" where …` names no count, no skill and nothing to act on.
    expect(
      [recusa, /Failed query/.test(recusa ?? '')],
      'the admin was handed the database\'s refusal instead of the product\'s. It arrives only ' +
        'because some maker happens to hold a level in this skill — the moment none does, the ' +
        'same delete succeeds and empties three ledger entries instead',
    ).toEqual([expect.stringMatching(/\b3 registros de XP\b/), false])
  })

  it('leaves the skill and its entries intact', async () => {
    expect([
      await quantas('skill', { id: { equals: skillNoPainel.id } }),
      await quantas('xpLedger', { skill: { equals: skillNoPainel.id } }),
    ]).toEqual([1, 3])
  })
})

describe('§3 — a skill no entry has ever named still deletes (FR-018)', () => {
  it('deletes the untouched skill', async () => {
    await apagarComoEquipe(skillIntocada)

    expect(
      await quantas('skill', { id: { equals: skillIntocada.id } }),
      'a skill with no ledger entry behind it was refused too. FR-018 bounds the refusal by ' +
        'history, not by collection — a blanket "delete is off" would leave a typo in the ' +
        'catalogue unremovable and push the team to edit rows makers hold levels in instead',
    ).toBe(0)
  })
})

/**
 * §4 — **the verb FR-018 is silent about the host on.**
 *
 * The requirement is unconditional: *"a skill with ledger entries cannot be hard-deleted"*. The
 * guard counts through `getTenantScopedPayload(req)`, which resolves the organization from the
 * request's **host** — so it answers the question in whichever lab the requester happens to be
 * browsing, not in the lab that owns the skill. For every ordinary admin those are the same lab,
 * which is exactly the shape §1–§3 have.
 *
 * `master` is not an ordinary admin. It is a first-class cross-tenant role this codebase designs
 * for (`userHasAccessToAllTenants: isMaster`, and both `teamOnly()` and `scopedAccess()` return
 * `true` for it), so a master browsing lab B can delete lab A's skill — and the count lands in
 * lab B, finds nothing, and the delete proceeds. `xp_ledger.skill_id` is `ON DELETE set null`,
 * so every entry that credited the skill silently loses it: no error, no total moved, and
 * nothing for FR-011's gate to notice, because the entries keep their `quantidade`.
 *
 * Driven through the same `payload.delete({ overrideAccess: false, user, req })` path the admin
 * panel and the REST API use — not a seed, and not the hostless server-side write the guard's
 * docblock already bounds itself out of.
 */
describe('§4 — the skill\'s own lab decides, never the requester\'s host (T037, FR-018)', () => {
  it('refuses a master deleting a credited skill from another lab\'s host', async () => {
    const antes = await entradasDaSkill(skillCreditada)
    expect(
      antes,
      'the subject holds no ledger entries, so the refusal below would be asserting about a ' +
        'skill FR-018 does not protect',
    ).toHaveLength(2)

    const erro = await tentarApagar(skillCreditada, {
      user: mestre,
      host: HOST_VIZINHO,
    })

    expect(
      erro,
      "a master browsing another lab deleted this lab's credited skill. The guard counted the " +
        'ledger in the lab the HOST resolves to, found none, and let it through — while ' +
        '`xp_ledger.skill_id` is ON DELETE set null, so the history it protects was emptied ' +
        'with no error anywhere. FR-018 names no host',
    ).not.toBeNull()
  })

  it('leaves the skill and its entries exactly as they were', async () => {
    const skill = await payload.find({
      collection: 'skill',
      where: { id: { equals: skillCreditada.id } },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    expect(skill.totalDocs, 'the skill was deleted anyway').toBe(1)

    expect(
      (await entradasDaSkill(skillCreditada)).length,
      'the entries lost the skill they credited — the orphaning FR-018 exists to prevent',
    ).toBe(2)
  })
})
