import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The project vocabulary of **one** lab (FR-002, T023).
 *
 * `projetos.md` lists CITe's categories — `Impressão 3D`, `Corte a Laser`, `Serigrafia` — as
 * examples, and the spec's fifth decision makes them per-organization rather than
 * platform-fixed: a global set would either force CITe's vocabulary on the second lab or need
 * a tenant column bolted on later, which is the reshape feature 000 exists to prevent.
 *
 * It lands **before** `projeto`, and that ordering is the task's whole point: `projeto.categoria`
 * relates here, and a relationship whose target does not exist is not a template the other
 * twelve collections can copy.
 *
 * The `tenant` field is injected by the multi-tenant plugin (and indexed by it — spike S1
 * found `index: true` hardcoded and unoverridable), so it is not declared here. What *is*
 * declared here is the collection's entry in the plugin's `collections` map and in
 * `SCOPE_REGISTRY`; `registry.test.ts` fails the build when those two disagree in either
 * direction.
 *
 * **`cor_chip` is deliberately absent.** `projetos.md` lists it as **(proposta)**, and the only
 * way to express "enum da paleta" here would be to restate feature 001's colour vocabulary as
 * string literals in the CMS — a second place for a token name to drift, in a codebase where
 * the palette is centralised on purpose and `--color-rosa` does not exist at all (feature 001,
 * CLR-001). The chip colour stays feature 003's rendering decision until there is a chip
 * renderer to decide it against; adding an optional field then is an additive migration.
 */
export const CategoriaProjeto: CollectionConfig = {
  slug: 'categoriaProjeto',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, SC-003, CLR-004). That
  // internal collection is not scoped by the multi-tenant plugin and each of its rows names a
  // document by collection and id. Locking is ON by default — Payload's predicate is
  // `lockDocuments !== false` — so the leak reopens by omission, which is why
  // `tests/tenancy/locked-documents.test.ts` asserts this over the whole scope registry rather
  // than per collection. The cost is CLR-004's, priced rather than discovered: no "someone
  // else is editing this" warning here.
  lockDocuments: false,
  labels: {
    singular: 'Categoria de projeto',
    plural: 'Categorias de projeto',
  },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'slug', 'updatedAt'],
    description: 'Vocabulário de categorias desta organização. Alimenta os chips e as abas de /projetos.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-019, CF-9). It is not optional
  // decoration: `isolation.test.ts` throws for a scoped collection that declares no `/mine`,
  // because a surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('categoriaProjeto')],
  access: {
    // Read is every member's: a maker must see the categories to file a project under one.
    // Returns a constraint, never a boolean (FR-006) — a boolean authorises the operation and
    // then leaks every row, including the other lab's vocabulary.
    read: scopedAccess(),
    // Writing the vocabulary is the team's (US7). `teamOnly` rather than `scopedAccess` is
    // why T023 waits on T007: a maker files projects into the categories the team defines,
    // and letting every maker mint one makes the filter tabs user-generated.
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
        description: 'Ex.: Impressão 3D, Corte a Laser, Serigrafia, Móveis, Eletrônica.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        // `TODOS` is a UI filter state, not a row here (projetos.md), so nothing seeds it.
        description: 'Usado no filtro ?categoria= da listagem. Sem acentos e sem espaços.',
      },
    },
  ],
}
