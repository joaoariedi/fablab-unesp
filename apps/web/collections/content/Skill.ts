import type {
  CollectionAfterChangeHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload'
import { APIError, commitTransaction } from 'payload'

import { assignSkillAtLevelZero, recomputeSkillPanels } from '../../lib/content/xp'
import {
  getTenantScopedPayload,
  type TenantScopedPayload,
  TenantUnresolvedError,
} from '../../lib/tenancy'
import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The slice of the choke-point client this file's hooks hand on — narrowed for `XpStore`'s
 * reason: putting a skill on a panel has no business creating or deleting anything, and a type
 * that cannot express those operations says so more durably than a comment.
 *
 * The walk itself lives in `lib/content/xp.ts` beside {@link recomputeSkillPanels}, which the
 * reactivation path runs immediately before it: the two write the same panels for two different
 * sets of makers, and keeping them apart put one of them behind a module boundary the other's
 * tests mock — see `skill-reparo.test.ts`, whose ordering contract covers both.
 */
type RosterStore = Pick<TenantScopedPayload, 'find' | 'update'>

/**
 * FR-017's hook: a newly created skill reaches every maker of the lab, at level 0.
 *
 * **Only when it arrives active.** `skillsAoNivelZero` gives a new profile the **active**
 * catalogue and nothing else (FR-013), so assigning a skill created with `ativa: false` would
 * make the two paths disagree about the same catalogue — and FR-019 keeps a deactivated skill
 * off the panel regardless. A skill added retired and switched on later is served by the
 * reactivation repair below and by `withSkillRow`, which appends the row for a profile that
 * predates a skill.
 *
 * **A write with no host is a SERVER-SIDE write** — a seed, a migration, a Local API call in a
 * test (`counters.test.ts` creates a `skill` exactly that way). The choke point quite correctly
 * refuses to guess an organization, and letting that refusal out of an `afterChange` hook would
 * roll back a catalogue row nobody did anything wrong to create (measured on `creditOnApproval`,
 * `Projeto.ts`, where registering a hook that did turned an unrelated test file red). The error
 * type is the check: re-deriving *"is there a host on this req"* here would be a second opinion
 * on a question `lib/tenancy` owns. It is resolved FIRST, before anything else happens, because
 * the step after it ends the caller's transaction and a server-side write must not pay that.
 *
 * ── Why the skill's own write COMMITS before a single panel is touched ──────────────────────
 *
 * This ran inside the create's transaction until it was measured, and the measurement is the
 * reason it does not. `perfilMaker.skills[].skill` carries the `sameTenant` validator, and that
 * validator resolves the referenced row through `unscopedLookupTenant` — a client built with
 * **no `req`**, and therefore on its own connection. An uncommitted `skill` row is invisible
 * there, so the lookup returns `null`, the tenants compare unequal, and the update is refused as
 * *"o documento referenciado pertence a outra organização"*. Payload's bulk update reports that
 * as an entry in `errors` with an empty `docs`, so what this hook saw was every profile of the
 * lab "matching no row":
 *
 *     CrossTenantError: perfilMaker 17423 matched no row in this organization, so the new
 *     skill 9724 was not assigned to it at level 0
 *
 * Committing first is therefore not a performance choice here — it is the only order in which
 * the write is legal at all. It also lands this on exactly the shape plan § D4 chose for the
 * reactivation repair, which is the sibling case one requirement away.
 *
 * **What it costs, stated rather than discovered later**: the two halves are no longer atomic,
 * so a failure midway leaves the skill created and some makers without its row. That failure is
 * *reported* — it propagates out of the hook and the admin sees it — and re-running the
 * assignment is safe, because a maker already carrying the row is skipped. What does not exist
 * is an automatic re-run: FR-011's gate reconciles projections against the **ledger** and a
 * level-0 row carries no XP, so nothing downstream notices. That is the honest residual risk of
 * this ordering, and it is smaller than the alternative, which is a write that cannot succeed.
 *
 * The commit is Payload's own utility rather than a hand-rolled `db.commitTransaction`, and the
 * reactivation repair's docblock below records why that second half matters: it also clears
 * `req.transactionID`, so every write the assignment performs opens a short transaction of its
 * own instead of joining a session that has just ended.
 */
const assignNewSkillToEveryMaker: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  if (doc.ativa !== true) return doc

  let store: RosterStore
  try {
    store = await getTenantScopedPayload(req)
  } catch (erro) {
    if (!(erro instanceof TenantUnresolvedError)) throw erro
    console.warn(
      `[skill] a skill ${String(doc.id)} foi criada sem host na requisição (escrita de ` +
        'servidor); nenhum maker recebeu o nível 0',
    )
    return doc
  }

  if (req.transactionID !== undefined && req.transactionID !== null) {
    await commitTransaction(req)
  }

  // The caller's own request, minus the transaction it no longer has: the choke point derives
  // the organization from it, so a client built from a fresh request would fill the wrong lab's
  // panels — or, on an apex host, none at all.
  await assignSkillAtLevelZero(req, doc.id as string | number, { getStore: async () => store })
  return doc
}

/**
 * The slice of the choke point the delete guard needs: **one counting read, and nothing else.**
 * Narrowed for `RosterStore`'s reason — a guard that could write is a guard that could "fix" the
 * history it exists to protect, and a type that cannot express the operation says so more
 * durably than a comment.
 */
type LedgerCounter = Pick<TenantScopedPayload, 'find'>

/**
 * How many ledger entries credit this skill, within the lab the request resolves to.
 *
 * `limit: 1` because only `totalDocs` is read: the count is the whole answer, and a guard that
 * paged the entries in to count them would grow with the history it is protecting.
 */
const contarCreditosDaSkill = async (
  store: LedgerCounter,
  skill: string | number,
): Promise<number> =>
  (
    await store.find({
      collection: 'xpLedger',
      where: { skill: { equals: skill } },
      limit: 1,
      depth: 0,
    })
  ).totalDocs

/**
 * **A skill the ledger names cannot be hard-deleted, and the refusal says how many entries
 * exist** (T037, FR-018, US4).
 *
 * Removing a skill is `ativa: false` (FR-015) and reactivation restores every level by
 * recomputing it from the ledger (FR-016) — both of which hold only while the row survives. An
 * `xpLedger` entry names its skill by id, so deleting the row makes the history of what was
 * earned in it unreadable and leaves {@link recomputeSkillPanels} nothing to restore from.
 *
 * **The database will not stop it**, which is why this is code and not a constraint:
 * `xp_ledger.skill_id` is `ON DELETE set null` (migration `20260914_173408_economia_xp_005`),
 * because FR-039 makes the column nullable — content that names no skill still credits the
 * total. So the delete succeeds and quietly empties the column on every entry that credited it.
 * Nothing downstream reports it either: the entries keep their `quantidade`, so no total moves
 * and FR-011's reconciliation gate — which compares projections against the ledger — still
 * agrees with itself.
 *
 * `perfil_maker_skills.skill_id` *is* `ON DELETE restrict`, so a skill sitting on some maker's
 * panel is refused by Postgres anyway — with `Failed query: delete from "skill" where …`, which
 * names no count and nothing an admin can act on. This runs in `beforeDelete`, ahead of that, so
 * the sentence the admin reads is the product's in both cases.
 *
 * **Why the count rather than a bare refusal**: an admin who believes the skill is unused has no
 * way to find out otherwise from the admin panel — the ledger's list view is scoped to the lab,
 * not to one skill. FR-018 asks for the number because the number is the evidence.
 *
 * **A write with no host is a SERVER-SIDE write** — a seed, a migration, a Local API call in a
 * test teardown — and it is allowed through with a warning, for the reason
 * {@link assignNewSkillToEveryMaker} records verbatim: the choke point quite correctly refuses
 * to guess an organization, and re-deriving *"is there a host on this req"* here would be a
 * second opinion on a question `lib/tenancy` owns. Counting through `req.payload` instead would
 * read every organization's ledger, which is the leak the import fence exists to prevent.
 *
 * That is the guard's honest bound: **it protects the admin panel and the REST API, not a
 * migration.** A server-side deleter is code somebody wrote, running in a tree where the
 * teardown order (`xpLedger` before `skill`) is already the documented convention — and it is
 * the one caller for which a refusal could not be reported to anybody anyway.
 */
const refuseDeleteWithLedgerEntries: CollectionBeforeDeleteHook = async ({ id, req }) => {
  let store: LedgerCounter
  try {
    store = await getTenantScopedPayload(req)
  } catch (erro) {
    if (!(erro instanceof TenantUnresolvedError)) throw erro
    console.warn(
      `[skill] exclusão da skill ${String(id)} sem host na requisição (escrita de servidor); ` +
        'o histórico de XP não pôde ser consultado e a exclusão seguiu (FR-018)',
    )
    return
  }

  // **The count is only an answer about this skill while the client can SEE this skill.**
  // `getTenantScopedPayload` derives its organization from the request's host, and `master` is
  // a first-class cross-tenant role here (`userHasAccessToAllTenants: isMaster`, and both
  // `teamOnly()` and `scopedAccess()` return `true` for it). So a master browsing lab B may
  // delete lab A's skill, and the count above would run in lab B, find nothing, and let it
  // through — measured on this tree in `skill-exclusao.test.ts` § 4: the skill row went, and
  // all three entries that credited it lost their `skill_id` with no error anywhere, because
  // the column is `ON DELETE set null`. FR-018 names no host.
  //
  // Asking whether the skill is visible here answers it through the choke point rather than
  // around it: a reader that could look the skill's own tenant up and then act inside it would
  // be a new door in `lib/tenancy`, and FR-018 does not need one — it needs the request to be
  // in the lab it is deleting from.
  const visivel = await store.find({
    collection: 'skill',
    where: { id: { equals: id } },
    limit: 1,
    depth: 0,
  })
  if (visivel.totalDocs === 0) {
    throw new APIError(
      `Esta skill pertence a outra organização: apague-a a partir do domínio do laboratório ` +
        `dono dela. Deste domínio o histórico de XP dela não pode ser consultado, e apagá-la ` +
        `deixaria esse histórico ilegível (skill ${String(id)}).`,
      409,
      undefined,
      true,
    )
  }

  const creditos = await contarCreditosDaSkill(store, id)
  if (creditos === 0) return

  throw new APIError(
    `Esta skill não pode ser apagada: o histórico guarda ${creditos} ` +
      `${creditos === 1 ? 'registro de XP creditado' : 'registros de XP creditados'} nela, e ` +
      'apagá-la deixaria esse histórico ilegível. Desmarque ATIVA para tirá-la do painel — o XP ' +
      `de todo mundo permanece e reativar traz os níveis de volta (skill ${String(id)}).`,
    // 409: the request is well-formed and the caller is allowed to delete skills — it is the
    // state of this one that refuses. `true` so the admin panel shows the sentence itself
    // rather than Payload's generic message, which is what happens to a non-public error in
    // production (`Media.ts`, same reason).
    409,
    null,
    true,
  )
}

/**
 * The skill catalogue of **one** lab (FR-013, FR-027, T005).
 *
 * **Why this one is scoped when its three siblings are not** (CLR-001). `avatarItem`,
 * `tomDePele` and `tomDeCabelo` are one designer's art shipped with the product and are
 * therefore global. `skill` is the exception the PO decided on 2026-08-24: the catalogue is
 * **administrable per organization** — the lab team adds and removes rows, and CITe's five
 * (`Modelagem 3D`, `Corte a Laser`, `Impressão 3D`, `Eletrônica`, `Design`) are a seed rather
 * than the platform's vocabulary. A global table here would either impose CITe's list on the
 * second lab or need a tenant column bolted on later, which is the reshape feature 000 exists
 * to prevent.
 *
 * **Removing a skill is `ativa: false`, never a delete** (`gamification.md`, PO 2026-08-24).
 * The XP ledger is immutable: taking a skill out of the panel must not move anybody's total,
 * and reactivating it must bring the old progress back. Both are only true while the row
 * survives — so deactivation is the product behaviour and `delete` is the admin's escape
 * hatch, not the documented one.
 *
 * **What is deliberately absent.** No `nivel`, no `xp`, no progress of any kind: those
 * describe a *maker's relation to* a skill, not the catalogue row, and declaring them here
 * would make them one value for the whole lab. They live on `perfilMaker.skills` (T009) as
 * `{ skill, nivel, xp }`, and feature 005 owns their evolution.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here.
 * Registration in `payload.config.ts` and the `SCOPE_REGISTRY` entry — **declared before
 * `perfilMaker`, which relates to this collection, because `fixtures.ts` seeds in registry
 * order and `resetWorld` deletes in reverse** — land together in T008: `registry.test.ts`
 * diffs config against registry in both directions, so the two cannot be added separately.
 */
export const Skill: CollectionConfig = {
  slug: 'skill',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Locking is
  // ON by default (the predicate is `lockDocuments !== false`), so the leak reopens by
  // omission. Same switch, same reason, as `categoriaProjeto` and `perfilMaker`.
  lockDocuments: false,
  labels: {
    singular: 'Skill',
    plural: 'Skills',
  },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'slug', 'ativa', 'updatedAt'],
    description:
      'Catálogo de skills desta organização. Alimenta o painel SUAS SKILLS. Para remover uma skill, desmarque ATIVA — apagar a linha não é o caminho.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-019, CF-9). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('skill')],
  hooks: {
    // FR-018's guard. `beforeDelete` rather than `afterDelete` for the obvious reason and one
    // less obvious: the hook runs before Payload has removed anything, so a refusal here costs
    // a rejected request instead of an error raised over data that is already gone.
    beforeDelete: [refuseDeleteWithLedgerEntries],
    /**
     * **Turning `ativa` back on restores every level in this skill** (FR-016, SC-008, T034).
     *
     * The panel is a projection and the ledger is the record, so the restoration is a
     * recompute: `recomputeSkillPanels` re-derives this skill's row for every maker the ledger
     * says earned in it, and re-appends the row to a panel that lost it. Nothing here consults
     * a saved copy of the old level, because there is none to consult — that is what makes
     * FR-016's *"at its previous value"* exact rather than approximate.
     *
     * **Why it fires on deactivation too**, when FR-015 says deactivation moves no XP: from the
     * ledger, the two directions compute the *same* numbers, so running both ways costs one
     * recompute and buys a panel that is correct on the way out as well as on the way back.
     * `tests/content/skill-catalogue.test.ts` §3 is the standing proof that the outbound run
     * moves nothing — it compares every total and every panel row, id included, across exactly
     * this write.
     *
     * The guard is `previousDoc`, not a diff of the whole document: a skill renamed or
     * re-slugged has no level to repair, and running the sum for it would make every catalogue
     * edit pay for the one field that matters.
     *
     * **The flag commits FIRST, and the repair runs after it — outside this write's
     * transaction** (T035, plan § D4). D4's first draft ran the recompute inside it, and the
     * review priced that: one ledger sum plus one profile update per earner, every one of them
     * while holding this `skill` row's lock, is a transaction whose length grows with the lab
     * and a lock every other writer queues behind. `recomputeSkillPanels` walks the earners in
     * pages — bounded by the makers the ledger says earned in *this* skill — so after the
     * commit each of those pages is its own short write instead of one long one.
     *
     * **Why giving up atomicity is safe here specifically**: neither half touches `xpLedger`.
     * The flag is a display rule (FR-019) and a level is a projection of an append-only table
     * (FR-001), so a repair interrupted halfway is *resumable* rather than wrong — re-running
     * it produces the same numbers from the same untouched ledger. FR-016 asks that levels be
     * restored, not that they be restored atomically with the flag, and the reconciliation
     * gate (FR-011) is what notices a repair that never finished.
     *
     * The commit is Payload's own utility rather than a hand-rolled `db.commitTransaction`,
     * because the second half matters as much as the first: it also **clears
     * `req.transactionID`**, which is what makes every write the repair performs open a short
     * transaction of its own instead of joining a session that has just ended. Payload's
     * `updateByID` commits again after this hook returns, and `killTransaction` runs on a
     * later error — both are no-ops once the id is gone (`sessions[transactionID]` is deleted
     * on commit), which is why committing early here does not corrupt the operation around it.
     *
     * **The trap**: this ends the *caller's* transaction, not merely this collection's write.
     * A future caller that wraps several writes in one `req` and updates a skill among them
     * would lose the rollback for everything after it. That is acceptable while the only
     * writers are the admin panel and the local API, each of which updates one skill per
     * request; a batch writer must repair out of band instead.
     */
    // FR-017 first, deliberately. The two never both act on one write — one answers `create`
    // and the other a change of `ativa` on a row that already exists — so the order changes
    // nothing today. It is one edit away from mattering: BOTH commit the caller's transaction
    // before doing their work, so a hook that assumed it still had one would be wrong about
    // whichever of these ran ahead of it.
    afterChange: [
      assignNewSkillToEveryMaker,
      async ({ doc, operation, previousDoc, req }) => {
        // On create there is no previous state and no maker can hold XP in a row that did not
        // exist a moment ago — FR-017 assigns the new skill at level 0 and owns that path.
        //
        // **Asked of `operation`, because `previousDoc` cannot answer it.** Payload passes
        // `previousDoc: {}` on a create (`collections/operations/create.js:285`), never
        // `undefined` — so the two lines below read `true === undefined`, and the repair ran on
        // **every skill ever created**. Measured on this tree, with T036's hook removed so only
        // this one could be responsible: `counters.test.ts` went red in `beforeAll` with
        // `TenantUnresolvedError: No host on the request`, from a fixture that creates a skill
        // through the Local API with no host — a server-side write this hook has no business
        // touching. `skill-reparo.test.ts` drives the create case with `previousDoc: undefined`,
        // a shape the framework never produces, which is why its five green tests said nothing
        // about it.
        if (operation !== 'update') return doc
        if (previousDoc === undefined || previousDoc === null) return doc
        // Every other catalogue edit returns before the commit: ending the caller's
        // transaction is a real cost, and a rename has no level to repair to justify it.
        if (doc.ativa === previousDoc.ativa) return doc

        if (req.transactionID !== undefined && req.transactionID !== null) {
          await commitTransaction(req)
        }

        // The caller's own request, minus the transaction it no longer has: the choke point
        // derives the organization from it, so a freshly built one would repair the wrong lab.
        await recomputeSkillPanels(req, doc.id as string | number)

        // **FR-017's other half, and it is not the same set of makers.** The repair above is
        // bounded by `earnersOfSkill` — the ledger — so it restores the level of everyone who
        // ever earned here and reaches nobody else. A skill created retired and published later
        // has no earners at all, so without this line the makers who were already here never
        // receive it while everybody who signs up from then on does (`skillsAoNivelZero` reads
        // the ACTIVE catalogue), and the lab carries two classes of maker in one catalogue.
        // Permanently: the panel renders from the stored rows, and FR-011's gate compares
        // against the ledger, where a level-0 row has no XP to disagree about. Measured in
        // `skill-nivel-zero.test.ts` § 3, which is red without it.
        //
        // Safe to run beside the repair rather than instead of it: `assignSkillAtLevelZero`
        // skips a maker who already carries the row, so the earners it has just restored are
        // left exactly as they are. It builds its own client from the same `req`, for the
        // reason the line above does.
        if (doc.ativa === true) {
          await assignSkillAtLevelZero(req, doc.id as string | number)
        }
        return doc
      },
    ],
  },
  access: {
    // Read is every member's: signup reads the active catalogue to assign it (FR-013), and
    // Minha Conta renders it. A constraint, never a boolean (FR-006) — a boolean authorises
    // the operation and then leaks every row, here the other lab's catalogue.
    read: scopedAccess(),
    // Administering the catalogue is the lab team's, scoped to their own lab. `teamOnly`
    // rather than `masterOnly` is what makes CLR-001's "administrable per organization" real
    // rather than stated; `teamOnly` rather than `scopedAccess` is the `categoriaProjeto`
    // precedent — a maker who could mint skills would make the SUAS SKILLS panel
    // user-generated, and every new row enters every maker's profile at level 0.
    create: teamOnly(),
    update: teamOnly(),
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'nome',
      type: 'text',
      required: true,
      label: 'Nome',
      admin: {
        description: 'Ex.: Modelagem 3D, Corte a Laser, Impressão 3D, Eletrônica, Design.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      // The seed and any later migration name a row by this rather than by database id.
      index: true,
      label: 'Slug',
      admin: {
        description: 'Identificador estável da skill. Sem acentos e sem espaços.',
      },
      // **Deliberately NOT `unique`.** Payload's `unique` is a constraint over the whole
      // table and the multi-tenant plugin does not narrow it to the tenant (it composes
      // access, not indexes) — the same trap `perfilMaker.handle` documents under CLR-002.
      // Every lab seeds `modelagem-3d`, so a global unique index would refuse the second lab
      // the row the PO decided it may have. Per-tenant uniqueness needs a composite
      // `(tenant, slug)` constraint, and it belongs with the migration that creates the table.
    },
    {
      name: 'ativa',
      type: 'checkbox',
      required: true,
      defaultValue: true,
      label: 'Ativa',
      admin: {
        description:
          'Skills inativas somem do painel sem alterar o XP de ninguém. Reativar faz o progresso reaparecer.',
      },
      // `required: true` does NOT mean "must be ticked" — measured on
      // `evento.inscricaoObrigatoria`: `validations.checkbox(false, { required: true })` is
      // accepted, while `undefined` returns `validation:trueOrFalse`. On a checkbox it means
      // "must carry a boolean", which is exactly the guarantee FR-013 needs: signup filters
      // the catalogue on this field for every new profile, and a nullable flag would make that
      // filter three-valued — the row answering `undefined` is the one silently left off a
      // maker's profile with nothing to show for it.
      //
      // `defaultValue: true` because a skill the team has just added is one they want in the
      // panel: new skills enter at level 0 for everybody (gamification.md, PO 2026-08-24).
    },
  ],
}
