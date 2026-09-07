import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The 3D-library vocabulary of **one** lab (FR-002, T039).
 *
 * `biblioteca-3d.md` lists CITe's sidebar — `Acessórios`, `Animais`, `Veículos`, `Decoração`,
 * `Educação`, `Utilidades` — as examples, and spec.md's fifth decision makes them
 * per-organization rather than platform-fixed, for the reason `categoriaProjeto` records: a
 * global set would either impose CITe's vocabulary on the second lab or need a tenant column
 * bolted on later, which is the reshape feature 000 exists to prevent.
 *
 * It is declared **before** `modelo3d` in this file's own task because `modelo3d.categoria`
 * relates here, and Payload throws `InvalidFieldRelationship` at config load for a
 * `relationTo` naming a collection that does not exist (spec § D2).
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here. What
 * registers this collection — the `collections` list in `payload.config.ts`, the plugin's
 * `collections` map and the `SCOPE_REGISTRY` entry — is **T044**, which is blocked on this
 * task and the five running beside it: `registry.test.ts` diffs config against registry in
 * both directions, so those edits can only move together, once.
 */
export const CategoriaModelo: CollectionConfig = {
  slug: 'categoriaModelo',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). That internal
  // collection is not scoped by the plugin and each of its rows names a document by
  // collection and id. The cost, priced in CLR-004 rather than discovered: no "someone else
  // is editing this" warning here.
  lockDocuments: false,
  labels: {
    singular: 'Categoria de modelo',
    plural: 'Categorias de modelo',
  },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'slug', 'ordem', 'totalModelos'],
    description: 'Categorias da Biblioteca 3D desta organização. Alimenta a barra lateral.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('categoriaModelo')],
  access: {
    // Read is every member's: a maker must see the categories to file a model under one.
    // A constraint, never a boolean (FR-006) — a boolean authorises the operation and then
    // leaks every row, including the other lab's vocabulary.
    read: scopedAccess(),
    // Writing the vocabulary is the team's (US7): the sidebar is a fixed, counted list in the
    // design, and letting every maker mint a category makes it user-generated.
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
        description: 'Ex.: Acessórios, Animais, Veículos, Decoração, Educação, Utilidades.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        // `TODOS` is a UI aggregate, not a row here (biblioteca-3d.md), so nothing seeds it.
        description: 'Usado no filtro ?categoria= da listagem. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'icone',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Ícone',
      admin: {
        description: 'SVG outline exibido ao lado do nome na barra lateral.',
      },
      // **A relationship, not an icon key** (D3 as revised, 2026-09-07). `biblioteca-3d.md`
      // allows either; a key would name an icon set that lives nowhere in this codebase yet,
      // while `midiaImagem` already carries the SVG rules — `.svg` is on its allowlist and
      // Payload runs `validateSvg` against scripts for it (`Media.ts` § ACCEPTED_MIME_TYPES).
      // Both sides are scoped, so the shared validator, never a local reimplementation.
      validate: sameTenant,
    },
    {
      name: 'totalModelos',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      label: 'Total de modelos',
      admin: {
        readOnly: true,
        description: 'Derivado dos modelos desta categoria. Mantido pelo sistema.',
      },
      // FR-020's third derived value, spelled exactly as `CounterField` names it: the
      // reconciliation gate recounts `modelo3d.categoria` into this column, and a different
      // name here would leave it with nothing to reconcile. Stored rather than counted on
      // read for the reason `curtidas` is: the sidebar renders every category's count on
      // every page of the library.
    },
    {
      name: 'ordem',
      type: 'number',
      required: false,
      defaultValue: 0,
      label: 'Ordem',
      admin: {
        description: 'Posição na barra lateral, de cima para baixo.',
      },
      // A number, not text: a text sort puts `10` before `2` the first time a lab declares
      // ten categories. Optional, as `biblioteca-3d.md` marks it.
    },
  ],
}
