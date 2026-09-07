import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A machine of **one** lab (FR-001, FR-003, FR-021, T041) — `calendario.md` § Coleções
 * relacionadas: "`maquina` — `nome`, `estacao`, `icone` (`.svg`), `skill` relacionada,
 * `manutencao_ate`". It is what the agenda's machine filter lists and what `evento.maquinas`
 * points at, so it lands before `evento`.
 *
 * Writing is the team's for `local`'s reason: a machine is inventory, and a maker minting one
 * from an event form makes the filter user-generated. Reading is every member's — a maker
 * choosing machines for the activity they propose has to see them.
 *
 * **Declared elsewhere, on purpose** — two of the page's five fields:
 *   - **`estacao`** and **`skill`** relate to collections that belong to feature 005 (spec
 *     § Scope, "Deliberately out"; FR-022 as amended by D2). Payload resolves `relationTo` at
 *     config load and throws `InvalidFieldRelationship` for an absent target, so declaring
 *     them here would not defer anything — it would stop the whole app from loading.
 *     `Projeto.ts` records the same deferral for `maquinas_utilizadas → estacao`. Both are
 *     additive the day 005 registers their targets, with no reshape of this collection.
 *
 * They are **not** replaced by a text field standing in for the relation: a string named
 * `estacao` beside a future `estacao` collection is two vocabularies for one concept and a
 * data migration to reconcile them, which is the shape feature 000 exists to prevent.
 *
 * **`read: scopedAccess()` is the admin and REST surface only** — same as `local`: the agenda
 * is served by `getPublicScopedPayload`, this collection carries no `status` so it is
 * deliberately outside the publishable set, and a machine reaches a visitor populated through
 * the published evento that names it.
 *
 * Registration is T044's single edit; `registry.test.ts` fails the build when the config and
 * `SCOPE_REGISTRY` disagree in either direction.
 */
export const Maquina: CollectionConfig = {
  slug: 'maquina',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004). The cost is CLR-004's: no
  // "someone else is editing this" warning on the shared admin.
  lockDocuments: false,
  labels: {
    singular: 'Máquina',
    plural: 'Máquinas',
  },
  admin: {
    // Also what the picker on `evento.maquinas` renders (FR-021).
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'manutencaoAte', 'updatedAt'],
    description: 'Máquinas desta organização. Alimentam o filtro da agenda e o metadado 🖨 do card.',
    group: 'Conteúdo',
  },
  // The isolation harness asserts a scoped collection through this surface (FR-021, SC-002).
  endpoints: [scopedListEndpoint('maquina')],
  access: {
    read: scopedAccess(),
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
        description: 'Ex.: Impressoras 3D, Corte a Laser, Serigrafia, Bordado Digital.',
      },
    },
    {
      name: 'icone',
      type: 'relationship',
      relationTo: 'midiaImagem',
      label: 'Ícone',
      admin: {
        description: 'Ícone outline (.svg) exibido ao lado do nome nos filtros e nos metadados.',
      },
      // Scoped → scoped: the icon belongs to the lab that uploaded it, so the shared
      // same-tenant validator applies (FR-007). Pointing at `midiaImagem` is also what makes
      // the image cap and allowlist apply without restating either here.
      validate: sameTenant,
    },
    {
      name: 'manutencaoAte',
      type: 'date',
      label: 'Manutenção até',
      admin: {
        description: 'Data em que a manutenção termina. Vazio significa disponível.',
      },
      // A date rather than a boolean: "em manutenção" is a fact that expires, and a flag
      // someone has to remember to clear is a machine that stays unavailable forever.
    },
  ],
}
