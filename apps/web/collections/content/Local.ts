import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A room or station of **one** lab (FR-001, FR-003, FR-021, T041) — `calendario.md`
 * § Coleções relacionadas: "`local` — `nome` (`Fab Lab CITe — Sala 2`), `descricao`, `mapa`
 * (`.png` `.svg`), `capacidade`".
 *
 * It lands **before** `evento`, and that ordering is the task's whole point: `evento.local` is
 * required, and Payload throws `InvalidFieldRelationship` at config load for a relationship
 * whose target does not exist.
 *
 * **Writing is the team's, reading every member's**, which is `categoriaProjeto`'s split for
 * `categoriaProjeto`'s reason: a room is a fact about the lab, not something a maker mints
 * while filling in an event form. `data-model.md` calls this collection a "physical resource
 * of one lab", and a physical resource nobody owns is one every listing has a duplicate of.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** A public visitor never
 * reaches this function: the agenda is served by `getPublicScopedPayload`, which goes *around*
 * collection access because the multi-tenant plugin AND-s its own
 * `{ tenant: { in: userTenantIDs } }` onto whatever we return and would nullify a public
 * branch (plan § Sketch 2). This collection carries no `status`, so `derivePublishable` leaves
 * it out of the publishable set on purpose — a public read of `local` is a refusal, and the
 * room reaches a visitor populated *through* the published evento that names it.
 *
 * The `tenant` field is injected by the multi-tenant plugin (and indexed by it), so it is not
 * declared here. Registration — the config list, the plugin's `collections` map and
 * `SCOPE_REGISTRY` — is T044's single edit: `registry.test.ts` diffs the two in both
 * directions and fails the build whenever they disagree.
 */
export const Local: CollectionConfig = {
  slug: 'local',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). Payload's
  // `checkDocumentLockStatus` reads `lockDocuments !== false` and returns before it touches
  // the database, so this is the framework's supported switch rather than a workaround. The
  // cost is priced in CLR-004: no "someone else is editing this" warning on the shared admin.
  lockDocuments: false,
  labels: {
    singular: 'Local',
    plural: 'Locais',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): `evento.local` points here, and
    // without this the admin offers ids to a team member choosing a room.
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'capacidade', 'updatedAt'],
    description: 'Salas e estações desta organização. Alimentam o metadado 📍 do card de evento.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('local')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then
    // every row leaks, including the other lab's floor plan.
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
        description: 'Ex.: Fab Lab CITe — Sala 2. Exibido no metadado 📍 do card.',
      },
    },
    {
      name: 'descricao',
      type: 'textarea',
      label: 'Descrição',
      admin: {
        description: 'Como chegar, o que a sala tem. Opcional.',
      },
    },
    {
      name: 'mapa',
      type: 'relationship',
      relationTo: 'midiaImagem',
      label: 'Mapa',
      admin: {
        description: 'Planta ou foto da sala (.png, .svg). Enviada para a biblioteca de imagens desta organização.',
      },
      // A relationship, not a text key (D3 as revised 2026-09-07): the media collection is
      // where the image group's cap and allowlist live, so a map inherits the image rules by
      // construction, and the database knows the file has an owner. Scoped → scoped, so the
      // shared validator applies — never a local reimplementation, because FR-007 is a
      // guarantee only while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'capacidade',
      type: 'number',
      min: 0,
      label: 'Capacidade',
      admin: {
        description: 'Quantas pessoas cabem. Referência para as vagas do evento, não um limite automático.',
      },
    },
  ],
}
