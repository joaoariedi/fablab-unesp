import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The CITe economy — **a seed, never the rule** (CLR-010).
 *
 * `gamification.md` and the spec both quote `1 XP por ação`, `5 XP por nível`, `máximo 10`
 * (PO, 2026-08-23). CLR-010 decided what those numbers *are*: the values a **new** organization
 * starts with, copied into its own row, and editable there afterwards. They are written here
 * once so the field defaults below and T013's `SEED_ON_CREATE` entry cannot drift apart —
 * `seed-on-create.ts` imports this rather than retyping `1 / 5 / 10`.
 *
 * `XpRules` in `packages/game/src/rules.ts` is the shape; this is one instance of it. The type
 * is deliberately **not** imported: `apps/web` does not depend on `@fablab/game` yet (the credit
 * path adds that in phase 3), and a dependency added here to borrow three property names would
 * be the first import of a package this collection never calls.
 */
export const REGRAS_XP_CITE = { xpPorAcao: 1, xpPorNivel: 5, nivelMaximo: 10 }

/**
 * One organization's XP economy (T005, FR-009, FR-028).
 *
 * **Why this is a row and not a constant.** CHK001 found FR-007 stating the level cap as a
 * requirement while FR-009 made it editable data, and the two cannot both be true. Constitution
 * Principle 3 breaks the tie in one sentence — *"retuning XP is an edit, not a deploy"* — so
 * the authority for the three tunables is this row, per organization, and `packages/game` takes
 * them as an argument precisely so no number of the economy is written into a deployment
 * (CLR-010).
 *
 * That has a consequence for everything downstream, stated here because this is the file the
 * numbers would otherwise come from: **a test asserting "the cap is 10" asserts a seed value**
 * and fails on a lab that retuned legitimately. `rules.test.ts` already injects its rules for
 * this reason.
 *
 * **Declared before everything else in this feature** (`regrasXp → missao → missaoSubmissao →
 * xpLedger`). Seeding walks `SCOPE_REGISTRY` forward and `resetWorld` deletes in reverse, so a
 * collection referenced by another is declared first — and every other piece of the economy
 * reads this one.
 *
 * **One row per organization, and that is an ACCESS rule rather than a convention.** `create`
 * and `delete` are flat refusals for everybody, so:
 *
 *   - the row arrives exactly once, from `SEED_ON_CREATE` through the system client, which runs
 *     `overrideAccess: true` and therefore never reaches these rules (T013); and
 *   - no second, contradictory economy can be added, and the existing one cannot be removed out
 *     from under its readers. Every reader — `creditXp`, the projections, the lab level, the
 *     ranking — asks this collection one question and expects one answer.
 *
 * Payload has no singleton-per-tenant primitive, and a unique index on the injected `tenant`
 * column would need `afterSchemaInit` (the `perfilMaker` handle precedent) plus its migration.
 * Refusing the verbs is what this file can guarantee on its own; if a later feature ever opens
 * `create` — to let a master re-seed a lab, say — the index becomes necessary rather than
 * optional, and that is the moment to add it.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here.
 * Registration in `payload.config.ts` and the `SCOPE_REGISTRY` entry land together in **T009**:
 * `registry.test.ts` diffs config against registry in both directions, so the two cannot be
 * added separately.
 *
 * **Deliberately absent, with the reason:**
 *   - **A `max` on any tunable.** A ceiling here is a deploy-time answer to a runtime question:
 *     a lab that wants twenty levels would need a migration, which is exactly the retune-by-edit
 *     CLR-010 protects. The floors below are different — they exclude arithmetic that has no
 *     meaning, not values a lab might want.
 *   - **Per-action XP overrides** (`xpPorAula`, `xpPorProjeto`, …). FR-006 is one flat rate for
 *     all five actions, and `aula.xpRecompensa` already exists for the per-content exception.
 *     Two tunables answering "what is this action worth" would need a precedence rule nobody
 *     has decided.
 */
export const RegrasXp: CollectionConfig = {
  slug: 'regrasXp',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection is
  // not scoped by the plugin and each row names a document by collection and id. Locking is ON
  // by default (the predicate is `lockDocuments !== false`), so the leak reopens by omission.
  lockDocuments: false,
  labels: {
    // Singular and plural are the same phrase: there is one row, and "Regra de XP" would
    // describe a single tunable rather than the economy the row holds.
    singular: 'Regras de XP',
    plural: 'Regras de XP',
  },
  admin: {
    defaultColumns: ['xpPorAcao', 'xpPorNivel', 'nivelMaximo', 'updatedAt'],
    description:
      'A economia desta organização. Editar aqui recalibra XP e níveis sem deploy — os valores vêm do padrão CITe ao criar a organização.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('regrasXp')],
  access: {
    // Every signed-in maker reads the economy: the pip bar, the level and the ranking are all
    // computed from it. A constraint, never a boolean (FR-006) — a boolean authorises the
    // operation and then leaks every row, here the other lab's economy.
    read: scopedAccess(),
    // See the docstring: one row per organization, seeded through the system client, which
    // overrides access. `false` rather than a constraint — this is a flat refusal, not a
    // narrowed row set.
    create: () => false,
    // FR-009's whole point. `teamOnly` rather than `masterOnly` is what makes "retuning is an
    // edit" true for the lab that wants it rather than for the platform operator; `teamOnly`
    // rather than `scopedAccess` because a maker who could edit this could set `xpPorNivel` to
    // 1 and reach the cap in ten actions.
    update: teamOnly(),
    // The economy has no end of life: deleting it leaves every reader dividing by undefined.
    // Retiring a lab is `organizations`' business, and `resetWorld` uses the Local API with
    // `overrideAccess: true`, so the test harness is unaffected by this refusal.
    delete: () => false,
  },
  fields: [
    {
      name: 'xpPorAcao',
      type: 'number',
      required: true,
      defaultValue: REGRAS_XP_CITE.xpPorAcao,
      // A negative rate would make publishing *cost* XP, which is not an economy anybody
      // decided; zero is meaningful — a lab pausing its gamification without deleting history.
      min: 0,
      label: 'XP por ação',
      admin: {
        description:
          'Quanto vale cada ação creditada (assistir aula, publicar projeto, modelo 3D, artigo, concluir missão). Padrão CITe: 1.',
      },
    },
    {
      name: 'xpPorNivel',
      type: 'number',
      required: true,
      defaultValue: REGRAS_XP_CITE.xpPorNivel,
      // **The floor is 1 because `levelFor` divides by this.** `Math.floor(5 / 0)` is
      // `Infinity`, so `min(nivelMaximo, Infinity)` pins every maker at the cap, and
      // `Math.floor(0 / 0)` is `NaN` — which the clamp in `rules.ts` does **not** rescue, since
      // `Math.max(0, Math.min(10, NaN))` is still `NaN`. The admin form below is exactly who
      // would type it, so the refusal belongs where they type rather than in the reader.
      min: 1,
      label: 'XP por nível',
      admin: {
        description: 'Largura de cada nível na curva. Padrão CITe: 5. Não pode ser 0 — o nível é XP dividido por este valor.',
      },
    },
    {
      name: 'nivelMaximo',
      type: 'number',
      required: true,
      defaultValue: REGRAS_XP_CITE.nivelMaximo,
      // Zero is a coherent setting (every maker sits at level 0 while the bar still fills);
      // negative is not, because `levelFor` clamps at 0 and the cap would be unreachable.
      min: 0,
      label: 'Nível máximo',
      admin: {
        description:
          'Onde a curva para. Padrão CITe: 10 — o painel SUAS SKILLS desenha um pip por nível. O XP continua subindo depois do teto; só o nível para.',
      },
    },
  ],
}
