import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'

/**
 * T033 / FR-015, SC-007, US4 — **deactivating a skill moves no XP.**
 *
 * SC-007 names the shape of its own evidence: *"a test that records every total, deactivates,
 * and re-reads"*. That is what this file is. It is an integration test rather than a
 * config-shape one because the requirement is about what a **write** does to rows the write
 * does not name: an admin updates one column of one `skill` row, and the claim is that two
 * other tables — `xp_ledger` and every earner's `perfil_maker` projection — come back
 * identical.
 *
 * Why the claim needs a test at all, when today nothing is registered on `skill` to move
 * anything: T035 is about to register an `afterChange` on this collection, because FR-016 needs
 * reactivation to restore every level. plan.md § Sketch 6 fires that repair on **any** change
 * to `ativa`, deactivation included — so from T035 onward a live recompute runs over every
 * earner on exactly the write this file performs. The failure that repair can introduce is
 * silent and permanent: a recompute that reads the *active* catalogue instead of the ledger
 * drops the deactivated skill's row from each panel, and the XP is gone with no error, no log
 * and an immutable ledger that still says otherwise. This file is the standing guard that runs
 * the moment that hook exists.
 *
 * **What is compared, and what is deliberately not.**
 *
 *   - **The ledger, whole documents, field for field.** FR-001 makes it append-only, so there
 *     is no legitimate reason for any byte of it to differ — `updatedAt` included. Comparing
 *     the full document is what makes an "update that changed nothing" visible, and an
 *     append-only table is the one place that strictness is free.
 *   - **The profiles, only their XP-bearing fields** — `xpTotal`, `nivel` and the `skills[]`
 *     panel with each row's own id. `updatedAt` is excluded **on purpose**: FR-015 is about
 *     values, not about writes, and a correct T035 that recomputes the same numbers from the
 *     untouched ledger would bump the timestamp while moving nothing. Asserting on it would
 *     fail a correct implementation, which is worse than useless — it is the kind of
 *     assertion that gets a real repair weakened to satisfy it.
 *   - Each panel row's **`id` is kept**, because `lib/content/xp.ts` builds the panel by
 *     copying every uncredited row back verbatim precisely so a write updates these rows
 *     rather than deleting and recreating them. A repair that rebuilt the panel with the same
 *     numbers but fresh row ids has lost that property, and nothing else in the tree notices.
 *
 * **The fixture is asserted to be non-trivial before the act.** "Nothing changed" is vacuously
 * true of a lab where nothing was ever earned, so §1 pins that the skill being deactivated
 * carries real XP on real panels first — and §2 pins that the deactivation actually applied,
 * because a write that silently did not happen also leaves everything unchanged (tasks.md,
 * *"assert a planted violation actually applied"*).
 *
 * The world is a sentinel organization of this file's own, torn down in `afterAll`:
 * `counters.test.ts` reconciles the WHOLE database, so a row left behind fails somebody else's
 * file (measured in 004 phase 6).
 */

const SLUG_SENTINELA = 't033-skill'
const HOST = `${SLUG_SENTINELA}.localhost`
const SENHA = 'fixture-password-123'

type Linha = { id: string | number }
type Documento = Record<string, unknown>

let payload: Payload
let tenant: string | number
let usuario: Linha
let capa: Linha
let categoria: Linha
/** The skill the admin removes. Two makers hold XP in it. */
let skillRemovida: Linha
/** The control: a second skill nobody touches, so a repair that nukes every panel is visible. */
let skillControle: Linha

/** Everything as it stood before the deactivation. */
let antes: Retrato
/** The `skill` row as stored after the act — the proof the act took place. */
let skillAposDesativar: Documento

/**
 * A request carrying the two things any write here needs, exactly as `xp-credit.test.ts`
 * builds one: the **host**, because the credit hook reaches Payload through
 * `getTenantScopedPayload`, which resolves the organization from `x-tenant-host` and skips the
 * write with a warning when there is none — the seeded XP would then be zero and every
 * comparison below would be between two empty worlds; and the **user**, because that client
 * reads with `overrideAccess: false` and a hook acting for nobody is refused in `executeAccess`.
 */
const pedido = () => ({ headers: new Headers({ 'x-tenant-host': HOST }), user: usuario }) as never

const criar = async (collection: string, data: Documento): Promise<Linha> =>
  (await payload.create({
    collection: collection as never,
    data: { ...data, tenant } as never,
    // Setting up the world is not the thing under test: forcing the setup through the guarded
    // path would make a broken guard look like a broken fixture (fixtures.ts, verbatim).
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Linha

/** The smallest Lexical document Payload accepts for a required `richText` field. */
const paragrafo = (texto: string) => ({
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
          { type: 'text', text: texto, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

/**
 * One publication, approved — the only way XP is earned in this file.
 *
 * Driven through a real approval rather than by calling `creditXp` directly, because what the
 * comparison needs is a projection built by the production path: a hand-written `xpTotal` and
 * a hand-written panel row would compare equal to themselves whatever the real credit does.
 */
const publicarArtigo = async (opcoes: {
  slug: string
  autor: string | number
  skill: string | number
}): Promise<void> => {
  const artigo = await criar('artigo', {
    titulo: `Artigo ${opcoes.slug}`,
    slug: opcoes.slug,
    resumo: `Resumo de ${opcoes.slug}.`,
    corpo: paragrafo(`Corpo de ${opcoes.slug}.`),
    capa: capa.id,
    categoria: categoria.id,
    autor: opcoes.autor,
    skill: opcoes.skill,
    status: 'rascunho',
  })
  await payload.update({
    collection: 'artigo',
    id: artigo.id,
    data: { status: 'publicado' } as never,
    overrideAccess: true,
    req: pedido(),
  })
}

/** Every ledger entry of this lab, whole, in a stable order. Read past access control. */
const ledger = async (): Promise<Documento[]> => {
  const { docs } = await payload.find({
    collection: 'xpLedger',
    where: { tenant: { equals: tenant } },
    sort: 'id',
    depth: 0,
    limit: 200,
    overrideAccess: true,
  })
  return docs as unknown as Documento[]
}

/** One row of the SUAS SKILLS panel, as stored at `depth: 0`. */
type LinhaPainel = { id?: unknown; skill?: unknown; nivel?: unknown; xp?: unknown }
/** A maker's XP, and nothing else about them — see the docblock on what is excluded. */
type ProjecaoPerfil = {
  id: unknown
  handle: unknown
  xpTotal: unknown
  nivel: unknown
  skills: LinhaPainel[]
}

/**
 * Every maker's XP in this lab, projected down to the fields FR-015 is about.
 *
 * Sorted by `handle` here and each panel sorted by `skill`, because `find` and an array field
 * both return rows in whatever order the database produced them — an unordered comparison
 * would fail on a reordering that moved no XP at all, and the resulting flake would be
 * "fixed" by weakening the assertion.
 */
const projecoes = async (): Promise<ProjecaoPerfil[]> => {
  const { docs } = await payload.find({
    collection: 'perfilMaker',
    where: { tenant: { equals: tenant } },
    sort: 'handle',
    depth: 0,
    limit: 200,
    overrideAccess: true,
  })
  return (docs as unknown as Documento[]).map((doc) => ({
    id: doc.id,
    handle: doc.handle,
    xpTotal: doc.xpTotal,
    nivel: doc.nivel,
    skills: [...((doc.skills as LinhaPainel[] | undefined) ?? [])].sort((a, b) =>
      String(a.skill).localeCompare(String(b.skill)),
    ),
  }))
}

type Retrato = { ledger: Documento[]; perfis: ProjecaoPerfil[] }

const retratar = async (): Promise<Retrato> => ({
  ledger: await ledger(),
  perfis: await projecoes(),
})

/** This maker's row for this skill in the panel — the value FR-015 promises never moves. */
const linhaDoPainel = (retrato: Retrato, handle: string, skill: Linha): LinhaPainel | undefined =>
  retrato.perfis
    .find((perfil) => perfil.handle === handle)
    ?.skills.find((linha) => String(linha.skill) === String(skill.id))

const conta = async (sufixo: string): Promise<Linha> =>
  (await payload.create({
    collection: 'users',
    data: {
      email: `${SLUG_SENTINELA}-${sufixo}@example.com`,
      password: SENHA,
      role: 'user',
      // `as never` for `criar`'s reason: `tenant` is `string | number` because a database need
      // not use integers, while the generated `User` narrows it to this database's own `number`.
      orgs: [{ organization: tenant, role: 'admin' }],
    } as never,
    overrideAccess: true,
  })) as unknown as Linha

const limpar = async () => {
  // Reverse dependency order: deleting forwards removes a row while its referrer still points
  // at it, and Postgres refuses on the foreign key (fixtures.ts § resetWorld). `skill` is
  // referenced by its artigos, by the ledger entries and by the makers' panels, so it goes
  // only once all three are gone.
  for (const collection of [
    'xpLedger',
    'artigo',
    'perfilMaker',
    'skill',
    'categoriaArtigo',
    'midiaImagem',
    'regrasXp',
  ]) {
    await payload.delete({
      collection: collection as never,
      where: { tenant: { equals: tenant } } as never,
      overrideAccess: true,
    })
  }
  await payload.delete({
    collection: 'users',
    where: { email: { like: `${SLUG_SENTINELA}-%` } },
    overrideAccess: true,
  })
  await payload.delete({
    collection: 'organizations',
    where: { slug: { equals: SLUG_SENTINELA } },
    overrideAccess: true,
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const organizacao = await payload.create({
    collection: 'organizations',
    data: { name: 'Lab T033', slug: SLUG_SENTINELA, status: 'active' },
    overrideAccess: true,
  })
  tenant = organizacao.id

  // Created before `pedido()` is ever called: every seed below travels as this user.
  usuario = await conta('admin')

  capa = await criar('midiaImagem', {})
  categoria = await criar('categoriaArtigo', { nome: 'Eixo T033', slug: 'eixo-t033', ordem: 1 })

  skillRemovida = await criar('skill', { nome: 'Corte a Laser', slug: 'corte-a-laser', ativa: true })
  skillControle = await criar('skill', { nome: 'Design', slug: 'design', ativa: true })

  const ana = await criar('perfilMaker', { nome: 'Ana T033', handle: '@anat033', usuario: usuario.id })
  const bruno = await criar('perfilMaker', {
    nome: 'Bruno T033',
    handle: '@brunot033',
    usuario: (await conta('bruno')).id,
  })

  // Ana earns in BOTH skills and Bruno only in the one being removed, so a repair that wipes
  // the deactivated skill and one that wipes the whole panel fail differently.
  await publicarArtigo({ slug: 'artigo-t033-a', autor: ana.id, skill: skillRemovida.id })
  await publicarArtigo({ slug: 'artigo-t033-b', autor: ana.id, skill: skillControle.id })
  await publicarArtigo({ slug: 'artigo-t033-c', autor: bruno.id, skill: skillRemovida.id })

  antes = await retratar()

  // The act under test: the admin removes a skill, which FR-015 defines as `ativa: false`.
  skillAposDesativar = (await payload.update({
    collection: 'skill',
    id: skillRemovida.id,
    data: { ativa: false } as never,
    overrideAccess: true,
    req: pedido(),
  })) as unknown as Documento
}, 120_000)

afterAll(async () => {
  if (payload) await limpar()
})

describe('§1 — the fixture has XP to lose (T033, FR-015, SC-007)', () => {
  it('earned three ledger entries, so "nothing changed" is a claim about something', () => {
    expect(
      antes.ledger,
      'no XP was ever credited in this lab, so every comparison below would hold between two ' +
        'empty worlds. A missing regrasXp row, a host-less request or an unregistered credit ' +
        'hook each produce exactly this, and each reads as green in a vacuous version of this file',
    ).toHaveLength(3)
  })

  it('put real XP on both makers, with the removed skill on both panels', () => {
    const ana = antes.perfis.find((perfil) => perfil.handle === '@anat033')
    const bruno = antes.perfis.find((perfil) => perfil.handle === '@brunot033')

    expect(ana?.xpTotal, 'Ana published twice and her total is not 2').toBe(2)
    expect(bruno?.xpTotal, 'Bruno published once and his total is not 1').toBe(1)

    for (const handle of ['@anat033', '@brunot033']) {
      expect(
        linhaDoPainel(antes, handle, skillRemovida)?.xp,
        `${handle} holds no XP in the skill about to be deactivated, so its disappearance ` +
          'would be indistinguishable from it never having been there',
      ).toBe(1)
    }
    expect(linhaDoPainel(antes, '@anat033', skillControle)?.xp).toBe(1)
  })
})

describe('§2 — the deactivation actually applied (T033, FR-015)', () => {
  it('stored ativa: false, because a write that never happened also changes nothing', () => {
    expect(
      skillAposDesativar.ativa,
      'the update returned without setting ativa to false, so §3 is asserting that a ' +
        'no-op is a no-op (tasks.md: assert the act actually applied)',
    ).toBe(false)
  })

  it('left the row itself alive — removal is deactivation, never a delete (FR-015)', async () => {
    const vivo = await payload.findByID({
      collection: 'skill',
      id: skillRemovida.id,
      depth: 0,
      overrideAccess: true,
    })

    expect(
      vivo,
      'the skill row is gone. Every level in it is then unreadable and FR-016 has nothing to ' +
        'restore, whatever the ledger still says',
    ).toBeTruthy()
  })
})

describe('§3 — and nothing else moved (T033, FR-015, SC-007)', () => {
  it('leaves the ledger byte-for-byte identical — it is append-only (FR-001)', async () => {
    const { ledger: depois } = await retratar()

    expect(
      depois,
      'deactivating a skill rewrote the ledger. Nothing may: it is the source every ' +
        'projection is recomputed from, so an entry edited here is XP that can never be ' +
        'restored by FR-016 and a history that no longer reconstructs',
    ).toEqual(antes.ledger)
  })

  it('leaves every maker\'s xpTotal, nivel and panel exactly as they were', async () => {
    const { perfis: depois } = await retratar()

    expect(
      depois,
      'deactivating a skill moved somebody\'s XP. FR-015 is explicit that removal is a ' +
        'catalogue act: the ledger is untouched and no maker\'s total changes. A projection ' +
        'recomputed from the ACTIVE catalogue rather than from the ledger fails exactly here, ' +
        'and fails silently everywhere else',
    ).toEqual(antes.perfis)
  })

  it('still carries the deactivated skill\'s XP on both panels — hidden is not erased', async () => {
    const depois = await retratar()

    for (const handle of ['@anat033', '@brunot033']) {
      expect(
        linhaDoPainel(depois, handle, skillRemovida),
        `${handle}'s row for the deactivated skill is gone from the stored panel. Hiding it ` +
          'from the SUAS SKILLS screen is FR-019 and is a READ concern; dropping the stored ' +
          'row destroys the value FR-016 promises will reappear on reactivation',
      ).toEqual(linhaDoPainel(antes, handle, skillRemovida))
    }
  })
})

/**
 * T034 / FR-016, SC-008, US4 — **reactivation restores every level exactly.**
 *
 * SC-008 names its evidence as *"the same test, continued"*, and this is that continuation: the
 * world §1–§3 left behind is the world reactivated here, so the values compared against are the
 * ones a real lab actually earned rather than a second fixture's.
 *
 * **Why the panel is corrupted first, and why that is not cheating.** After §3 the skill is
 * merely deactivated and nothing was destroyed — so a reactivation that did *nothing at all*
 * would satisfy a naive "the levels are still right" assertion. That test would pass today,
 * pass forever, and never once exercise FR-016. The requirement is not *the value survived*; it
 * is that the value is **recomputed from the ledger** ("restores every level exactly, because it
 * is recomputed from an untouched ledger"). The only way to tell a recompute from a no-op is to
 * let the two disagree: the panel is driven off the ledger while the skill is inactive, and the
 * reactivation is asked to put it back.
 *
 * The drift is planted in the two shapes a projection can actually reach while a skill is out of
 * the panel — a row left holding a stale value (a restore from an older dump, a half-applied
 * repair, a read-side filter that wrote back) and a row dropped outright (an implementation of
 * FR-019 that pruned the panel instead of hiding it, which is precisely what §3 forbids and what
 * a future change could still do). Ana's stale value is deliberately one the ledger **cannot**
 * produce — `nivel: 7, xp: 99` off three entries worth one XP each — so nothing here can pass by
 * coincidence: only a value derived from `xpLedger` lands back on the numbers §1 pinned.
 *
 * The ledger is asserted untouched **before** the act as well as after it. That is the premise
 * of the whole requirement: a level that is restored from anywhere else is restored from a copy,
 * and a copy is the thing FR-001 exists to not have.
 */

/**
 * A panel row's values, without the array row's own id.
 *
 * Used only where the id genuinely cannot survive — a row deleted from the array and re-appended
 * by the repair is a new row, and demanding its old id back would fail a correct implementation.
 * Everywhere the row does survive, §4 compares the whole object, id included, for the reason the
 * file's opening docblock gives.
 */
const valoresDaLinha = (linha: LinhaPainel | undefined) =>
  linha === undefined
    ? undefined
    : { skill: String(linha.skill), nivel: linha.nivel, xp: linha.xp }

/** A maker's stored profile, by handle, past access control. */
const perfilPorHandle = async (handle: string): Promise<Documento> => {
  const { docs } = await payload.find({
    collection: 'perfilMaker',
    where: { and: [{ tenant: { equals: tenant } }, { handle: { equals: handle } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const perfil = (docs as unknown as Documento[])[0]
  if (!perfil) throw new Error(`no perfilMaker ${handle} in this lab — the fixture never built it`)
  return perfil
}

/** Overwrite one maker's panel wholesale — the drift, planted. */
const escreverPainel = async (perfil: Documento, skills: LinhaPainel[]): Promise<void> => {
  await payload.update({
    collection: 'perfilMaker',
    id: perfil.id as string | number,
    data: { skills } as never,
    overrideAccess: true,
    req: pedido(),
  })
}

const painelDe = (perfil: Documento): LinhaPainel[] =>
  (perfil.skills as LinhaPainel[] | undefined) ?? []

const ehARemovida = (linha: LinhaPainel) => String(linha.skill) === String(skillRemovida.id)

describe('§4 — reactivation restores every level exactly (T034, FR-016, SC-008)', () => {
  /** The corrupted world, as stored in the instant before the reactivation. */
  let driftado: Retrato
  /** The `skill` row as stored after the reactivation — the proof the act took place. */
  let skillAposReativar: Documento
  /** The world the reactivation produced. */
  let depois: Retrato

  beforeAll(async () => {
    const ana = await perfilPorHandle('@anat033')
    const bruno = await perfilPorHandle('@brunot033')

    // Drift 1 — the row survives holding a level the ledger cannot justify. Restoring it needs a
    // sum over `xpLedger`; leaving the panel alone cannot produce 1 XP and level 0 from here.
    await escreverPainel(
      ana,
      painelDe(ana).map((linha) => (ehARemovida(linha) ? { ...linha, nivel: 7, xp: 99 } : linha)),
    )
    // Drift 2 — the row is gone. The repair has to re-append it, which is the case
    // `lib/content/xp.ts` § withSkillRow documents as "a profile that predates a skill".
    await escreverPainel(bruno, painelDe(bruno).filter((linha) => !ehARemovida(linha)))

    driftado = await retratar()

    // The act under test: the admin puts the skill back.
    skillAposReativar = (await payload.update({
      collection: 'skill',
      id: skillRemovida.id,
      data: { ativa: true } as never,
      overrideAccess: true,
      req: pedido(),
    })) as unknown as Documento

    depois = await retratar()
  }, 120_000)

  it('planted a panel the ledger disagrees with, so there is something to restore', () => {
    expect(
      valoresDaLinha(linhaDoPainel(driftado, '@anat033', skillRemovida)),
      'the drift never applied, so every assertion below would be checking that a no-op is a ' +
        'no-op — the exact vacuous shape tasks.md warns about (assert a planted violation ' +
        'actually applied)',
    ).toEqual({ skill: String(skillRemovida.id), nivel: 7, xp: 99 })

    expect(
      linhaDoPainel(driftado, '@brunot033', skillRemovida),
      "Bruno's row for the deactivated skill is still on his panel, so the reactivation is " +
        'never asked to bring a missing row back',
    ).toBeUndefined()
  })

  it('drifted the panel only — the ledger, the one source a level can come FROM, is intact', () => {
    expect(
      driftado.ledger,
      'the plant rewrote the ledger. FR-016 restores a level by recomputing it from these ' +
        'entries, so a test that damaged them would be asking the implementation to invent the ' +
        'answer rather than derive it',
    ).toEqual(antes.ledger)
  })

  it('stored ativa: true, because a reactivation that never happened restores nothing', () => {
    expect(
      skillAposReativar.ativa,
      'the update returned without setting ativa back to true, so the repair was never given ' +
        'the trigger FR-016 hangs on',
    ).toBe(true)
  })

  it("restores Ana's level and XP into the SAME panel row she already had (FR-016)", () => {
    expect(
      linhaDoPainel(depois, '@anat033', skillRemovida),
      "Ana's level in the reactivated skill did not come back at its previous value. Either " +
        'nothing recomputed it — reactivation is a flag flip and the stale 7/99 survived — or ' +
        'the panel was rebuilt with a fresh row id, which loses the update-in-place property ' +
        '`withSkillRow` exists to keep',
    ).toEqual(linhaDoPainel(antes, '@anat033', skillRemovida))
  })

  it("brings Bruno's missing row back at exactly its previous level (FR-016)", () => {
    expect(
      valoresDaLinha(linhaDoPainel(depois, '@brunot033', skillRemovida)),
      "Bruno holds no row for the reactivated skill. His XP is still in the ledger, so the " +
        'panel now under-reports what he earned and FR-016\'s promise — every maker\'s level in ' +
        'it reappears at its previous value — is false for him',
    ).toEqual(valoresDaLinha(linhaDoPainel(antes, '@brunot033', skillRemovida)))
  })

  it('moves nothing outside the reactivated skill — the control row and both totals hold', () => {
    expect(
      linhaDoPainel(depois, '@anat033', skillControle),
      "Ana's row in the skill nobody touched changed. A repair bounded by the skill it was " +
        'fired for cannot reach this row; one that rebuilds whole panels can, and wipes every ' +
        'level the ledger happens to disagree with',
    ).toEqual(linhaDoPainel(antes, '@anat033', skillControle))

    for (const handle of ['@anat033', '@brunot033']) {
      expect(
        depois.perfis.find((perfil) => perfil.handle === handle)?.xpTotal,
        `${handle}'s xpTotal moved across a catalogue act. Reactivating a skill adds no XP: ` +
          'the entries were already there and already counted (FR-015, FR-016)',
      ).toBe(antes.perfis.find((perfil) => perfil.handle === handle)?.xpTotal)
    }
  })

  it('leaves the ledger byte-for-byte identical afterwards too (FR-001)', () => {
    expect(
      depois.ledger,
      'the reactivation wrote to the ledger. Restoring a level is a projection repair and may ' +
        'append nothing: an entry written here would double-count on the next recompute and ' +
        'could never be taken back out of an append-only table',
    ).toEqual(antes.ledger)
  })
})

/**
 * T038 / FR-019, US9 — **a deactivated skill is hidden from new assignment, and hidden is not
 * erased.**
 *
 * FR-019 has three clauses and two of them already have a home: the maker's panel is filtered
 * at read time (`tests/accounts/minha-conta-page.test.ts` §4 renders a retired skill's row and
 * asserts it does not appear) and a retired skill is never handed to a *new* profile
 * (`tests/content/skill-nivel-zero.test.ts` §2, which cites FR-019 by name). The clause with no
 * guard anywhere is the middle one — *"hidden … from new mission and content assignment"* — and
 * it is the one a test has to buy, because nothing about `ativa: false` stops an author from
 * naming the retired skill on the next article they write. The catalogue then says the skill is
 * gone while the review queue keeps producing publications that credit XP into it, which is the
 * shape FR-015 and FR-016 spend their whole existence keeping honest.
 *
 * **Why this is the same file rather than a new one.** The claim is about a world where a skill
 * carries real, earned XP — §1 built exactly that and §3/§4 proved it survives a deactivation
 * and a reactivation. Re-deactivating it here costs one write and inherits three ledger entries
 * on two panels, so *"without changing stored progress"* is a claim about something. A fresh
 * fixture would re-seed all of it to say less.
 *
 * **What "hidden" means here, stated because it bounds the assertions.** It is a rule about
 * what may be **offered and newly chosen**, not a rewrite of what is already stored:
 *
 *   - a document that does not name this skill yet may not start naming it (§5.2);
 *   - a document that *already* names it stays writable (§5.3) — an artigo published in a skill
 *     the lab later retired must still be editable, or removing a skill quietly bricks every
 *     publication that ever credited it, which is "erased" wearing a different coat;
 *   - the panels and the ledger do not move at all (§5.4), which is FR-015 re-proved on the
 *     second deactivation, after a reactivation round trip has run between them.
 *
 * The rule is asserted on **all five** surfaces that assign a skill — the mission and the four
 * publishables — because one collection left out is one door the retired skill walks back in
 * through, and the four publishables are already a template that drifts (`publicacao-skill.test.ts`
 * exists for that reason). The behavioural proof is driven through `artigo`, with the ACTIVE
 * control skill as the positive control: without it a create refused for a missing field, a
 * broken fixture or a tenancy error would read exactly like a create refused for `ativa`.
 */

/** The five surfaces a skill is assigned FROM: a mission, and the four publishables. */
const SUPERFICIES_DE_ESCOLHA = ['missao', 'projeto', 'artigo', 'aula', 'modelo3d'] as const

type CampoSkill = { name?: string; type?: string; filterOptions?: unknown }

/**
 * The `skill` relationship of one collection, read off the **sanitized** config.
 *
 * `flattenedFields` for `publicacao-skill.test.ts`'s reason: a relationship nested in a group or
 * a tab is still a column, and a walk of the top level alone would exempt it silently.
 */
const campoSkillDe = async (colecao: string): Promise<CampoSkill | undefined> => {
  const sanitizada = await config
  const registrada = sanitizada.collections.find((c) => c.slug === colecao)
  if (!registrada) throw new Error(`${colecao} não está registrada no payload.config`)
  return (registrada.flattenedFields as unknown as CampoSkill[]).find((f) => f.name === 'skill')
}

/**
 * What the picker may offer while a **new** document is being written — the `filterOptions` of
 * that field, evaluated for a document that has no id and therefore no skill of its own yet.
 *
 * Evaluated rather than merely inspected: a static `Where` and a function that computes one are
 * both legal here, and only the answer is the requirement.
 *
 * **The request is not decoration.** The multi-tenant plugin wraps whatever a field declares and
 * AND-s its own tenant clause onto the result (`addFilterOptionsToFields`), and that wrapper
 * reads `req.payload` unconditionally — so `filterOptions` is *always* a function on a scoped
 * relationship, and calling it without a request is a TypeError rather than an answer. The stub
 * carries a real Payload and no tenant cookie and no user, which is the one combination for
 * which the plugin's own clause resolves to `null` and returns the declared filter untouched:
 * what comes back is therefore this collection's rule alone, with nothing of the plugin's mixed
 * into the comparison.
 */
const filtroDeCriacao = async (colecao: string): Promise<unknown> => {
  const filtro = (await campoSkillDe(colecao))?.filterOptions
  if (typeof filtro !== 'function') return filtro
  return await (filtro as (args: Record<string, unknown>) => unknown)({
    id: undefined,
    blockData: undefined,
    data: {},
    relationTo: 'skill',
    req: { payload, headers: new Headers() },
    siblingData: {},
    user: undefined,
  })
}

/** A write and whether it was allowed — with the refusal kept, so §5 can say WHY it refused. */
type Tentativa = { ok: boolean; erro: string }

/**
 * Payload reports a refused relationship as a `ValidationError` whose useful half is in `data`
 * (the field name and its message); the top-level `message` is the generic "The following field
 * is invalid". Both are kept, because an assertion that cannot name the offending field would
 * pass just as happily on a create refused for a missing `capa`.
 */
const relatoDoErro = (erro: unknown): string => {
  const base = erro instanceof Error ? erro.message : String(erro)
  const dados = (erro as { data?: unknown })?.data
  return dados === undefined ? base : `${base} — ${JSON.stringify(dados)}`
}

const tentar = async (acao: () => Promise<unknown>): Promise<Tentativa> => {
  try {
    await acao()
    return { ok: true, erro: '' }
  } catch (erro) {
    return { ok: false, erro: relatoDoErro(erro) }
  }
}

/**
 * A draft naming one skill. **`rascunho`, deliberately**: publishing it would credit XP and §5.4
 * asserts the ledger did not move, so the act under test has to be the *assignment* alone.
 */
const criarRascunhoComSkill = (opcoes: {
  slug: string
  autor: string | number
  skill: string | number
}): Promise<Linha> =>
  criar('artigo', {
    titulo: `Artigo ${opcoes.slug}`,
    slug: opcoes.slug,
    resumo: `Resumo de ${opcoes.slug}.`,
    corpo: paragrafo(`Corpo de ${opcoes.slug}.`),
    capa: capa.id,
    categoria: categoria.id,
    autor: opcoes.autor,
    skill: opcoes.skill,
    status: 'rascunho',
  })

const artigoPorSlug = async (slug: string): Promise<Linha> => {
  const { docs } = await payload.find({
    collection: 'artigo',
    where: { and: [{ tenant: { equals: tenant } }, { slug: { equals: slug } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  const artigo = (docs as unknown as Linha[])[0]
  if (!artigo) throw new Error(`no artigo ${slug} in this lab — the fixture never built it`)
  return artigo
}

describe('§5 — hidden from new assignment, and hidden is not erased (T038, FR-019, US9)', () => {
  /** The world as §4 left it: the skill active again, every level restored. */
  let antesDeEsconder: Retrato
  /** The `skill` row as stored after the second deactivation — the proof the act took place. */
  let skillAposEsconder: Documento
  /** A brand-new article naming the RETIRED skill. FR-019 is about exactly this write. */
  let novoComRetirada: Tentativa
  /** The same write naming the ACTIVE skill — the control that makes the refusal mean `ativa`. */
  let novoComAtiva: Tentativa
  /** An article that ALREADY names the retired skill, re-saved with that same value. */
  let regravarOQueJaNomeia: Tentativa
  /** The world after all three writes. */
  let depoisDeEsconder: Retrato

  beforeAll(async () => {
    const ana = await perfilPorHandle('@anat033')
    antesDeEsconder = await retratar()

    // The act under test: the admin retires the skill again, after §4 put it back.
    skillAposEsconder = (await payload.update({
      collection: 'skill',
      id: skillRemovida.id,
      data: { ativa: false } as never,
      overrideAccess: true,
      req: pedido(),
    })) as unknown as Documento

    novoComRetirada = await tentar(() =>
      criarRascunhoComSkill({
        slug: 'artigo-t038-retirada',
        autor: ana.id as string | number,
        skill: skillRemovida.id,
      }),
    )
    novoComAtiva = await tentar(() =>
      criarRascunhoComSkill({
        slug: 'artigo-t038-ativa',
        autor: ana.id as string | number,
        skill: skillControle.id,
      }),
    )

    const jaPublicado = await artigoPorSlug('artigo-t033-a')
    regravarOQueJaNomeia = await tentar(() =>
      payload.update({
        collection: 'artigo',
        id: jaPublicado.id,
        // The skill it already carries, re-sent — what the admin panel does on every save, and
        // what a republish through the review queue does with the whole document.
        data: { skill: skillRemovida.id, resumo: 'Resumo reescrito depois da desativação.' } as never,
        overrideAccess: true,
        req: pedido(),
      }),
    )

    depoisDeEsconder = await retratar()
  }, 120_000)

  it('retired a skill two makers still hold XP in, so there is progress to preserve', () => {
    expect(
      skillAposEsconder.ativa,
      'the second deactivation never applied, so every assertion below is about an ACTIVE ' +
        'skill and asserts nothing at all (tasks.md: assert the act actually applied)',
    ).toBe(false)

    for (const handle of ['@anat033', '@brunot033']) {
      expect(
        linhaDoPainel(antesDeEsconder, handle, skillRemovida)?.xp,
        `${handle} holds no XP in the skill being retired here — §4 was supposed to have ` +
          'restored it, so "without changing stored progress" would be a claim about nothing',
      ).toBe(1)
    }
  })

  it('refuses a NEW article that names the retired skill (FR-019)', () => {
    expect(
      novoComRetirada.ok,
      'a brand-new article was allowed to name a skill the lab has retired. The catalogue then ' +
        'says the skill is gone while the review queue keeps minting XP into it — every ' +
        'publication approved this way credits a skill no maker can see on their panel',
    ).toBe(false)

    expect(
      novoComRetirada.erro.toLowerCase(),
      'the write was refused, but not for the skill: the message names another field, so this ' +
        'test would stay green on a fixture that broke for an unrelated reason',
    ).toContain('skill')
  })

  it('still accepts the same article when it names an ACTIVE skill (the control)', () => {
    expect(
      novoComAtiva.ok,
      `naming an ACTIVE skill was refused too (${novoComAtiva.erro}), so the refusal above is ` +
        'not evidence of anything about `ativa` — FR-019 hides the retired skill, it does not ' +
        'close the surface',
    ).toBe(true)
  })

  it('keeps an article that ALREADY names it writable — hidden is not erased (FR-015)', () => {
    expect(
      regravarOQueJaNomeia.ok,
      `an article that already named the retired skill can no longer be saved ` +
        `(${regravarOQueJaNomeia.erro}). Retiring a skill would then brick every publication ` +
        'that ever credited it: no edit, no republish, no correction — the team\'s only way out ' +
        'being to re-point the content at a different skill, which is the ledger\'s history ' +
        'rewritten to satisfy a display rule (FR-015, FR-019)',
    ).toBe(true)
  })

  it('declares the rule on all five surfaces a skill is assigned from (FR-019)', async () => {
    for (const colecao of SUPERFICIES_DE_ESCOLHA) {
      expect(
        await filtroDeCriacao(colecao),
        `${colecao} offers the whole catalogue when a new document picks its skill, retired ` +
          'rows included. One collection left out is one door the retired skill walks back in ' +
          'through, and the four publishables are a template that has drifted before',
      ).toEqual({ ativa: { equals: true } })
    }
  })

  it('moved no XP: the ledger and every panel are exactly as they were (FR-015)', () => {
    expect(
      depoisDeEsconder.ledger,
      'hiding the skill from new assignment rewrote the append-only ledger',
    ).toEqual(antesDeEsconder.ledger)

    expect(
      depoisDeEsconder.perfis,
      'hiding the skill from new assignment moved somebody\'s XP. FR-019 is a display rule: ' +
        'what a maker already earned in a retired skill stays on the panel, stays in the ' +
        'total, and reappears the moment the admin turns it back on (FR-015, FR-016)',
    ).toEqual(antesDeEsconder.perfis)

    for (const handle of ['@anat033', '@brunot033']) {
      expect(
        linhaDoPainel(depoisDeEsconder, handle, skillRemovida),
        `${handle}'s stored row for the retired skill changed. Hiding it from the panel and ` +
          'from the next assignment is a READ rule; touching the stored row destroys the value ' +
          'FR-016 promises will reappear on reactivation',
      ).toEqual(linhaDoPainel(antesDeEsconder, handle, skillRemovida))
    }
  })
})
