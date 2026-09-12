import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

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
