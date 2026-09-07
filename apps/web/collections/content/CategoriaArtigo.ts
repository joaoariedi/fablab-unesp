import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The editorial vocabulary of **one** lab (FR-002, T038).
 *
 * `artigos.md` lists CITe's tabs — `CULTURA MAKER`, `EDUCAÇÃO`, `TECNOLOGIA`,
 * `INOVAÇÃO SOCIAL`, `PUBLICAÇÃO` — as examples, and spec.md's fifth decision makes them
 * per-organization rather than platform-fixed, for the reason `categoriaProjeto` records: a
 * global set would either impose CITe's vocabulary on the second lab or need a tenant column
 * bolted on later, which is the reshape feature 000 exists to prevent.
 *
 * It is declared **before** `artigo` in this file's own task because `artigo.categoria`
 * relates here, and Payload throws `InvalidFieldRelationship` at config load for a
 * `relationTo` naming a collection that does not exist (spec § D2 — the amendment that moved
 * FR-022's fields to feature 005 for exactly this reason).
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here.
 * What registers this collection — the `collections` list in `payload.config.ts`, the
 * plugin's `collections` map and the `SCOPE_REGISTRY` entry — is **T044**, which is blocked
 * on this task and the five running beside it: `registry.test.ts` diffs config against
 * registry in both directions, so those edits can only move together, once.
 *
 * **`cor_chip` is deliberately absent**, the same call `CategoriaProjeto.ts` records and for
 * the same reason: `artigos.md` marks it **(proposta)**, and expressing "padrão rosa da
 * identidade" here would restate feature 001's colour vocabulary as strings in the CMS — a
 * second place for a token name to drift. Adding an optional field once feature 003 has a
 * chip renderer to decide it against is an additive migration.
 */
export const CategoriaArtigo: CollectionConfig = {
  slug: 'categoriaArtigo',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). That internal
  // collection is not scoped by the plugin and each of its rows names a document by
  // collection and id. The cost, priced in CLR-004 rather than discovered: no "someone else
  // is editing this" warning here.
  lockDocuments: false,
  labels: {
    singular: 'Categoria de artigo',
    plural: 'Categorias de artigo',
  },
  admin: {
    useAsTitle: 'nome',
    defaultColumns: ['nome', 'slug', 'ordem', 'updatedAt'],
    description: 'Eixos temáticos desta organização. Alimenta os chips e as tabs de /artigos.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('categoriaArtigo')],
  access: {
    // Read is every member's: an author must see the eixos to file an article under one.
    // A constraint, never a boolean (FR-006) — a boolean authorises the operation and then
    // leaks every row, including the other lab's vocabulary.
    read: scopedAccess(),
    // Writing the vocabulary is the team's (US7): letting every maker mint an eixo makes the
    // filter tabs user-generated, and the tabs are a fixed, ordered bar in the design.
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
        description: 'Ex.: Cultura Maker, Educação, Tecnologia, Inovação Social, Publicação.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        // `TODOS` is a UI filter state, not a row here (artigos.md), so nothing seeds it.
        description: 'Usado no filtro ?categoria= da listagem. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'ordem',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Ordem',
      admin: {
        description: 'Posição na barra de tabs, da esquerda para a direita.',
      },
      // A number, not text: `artigos.md` gives the tabs an exact order, and a text sort puts
      // `10` before `2` the first time a lab declares ten eixos.
    },
  ],
}
