import type { CollectionConfig } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A challenge **one** lab publishes for its makers (T026, FR-020, FR-028).
 *
 * FR-020 names five things and this file carries exactly those: a title, a description, an
 * icon, **the skill it credits**, and a published state. What a maker *did* about a mission is
 * not here — that is `missaoSubmissao` (T027), one row per (mission, maker), with the proof
 * photo and the review state. Keeping the two apart is what lets FR-024 show the same mission
 * to a signed-out visitor with no personal percentage at all.
 *
 * **Missions are curated by the team** (`gamification.md`, PO 2026-08-24), so writing is
 * `teamOnly()` while reading is every member's. That single decision is also why no
 * `canPublishField` guard is declared on `status` below: that function exists for the
 * collections a maker may write — `artigo`, `projeto` — where a collection-level rule cannot
 * tell "submit for review" from "publish". Here the collection rule already answers it, and
 * adding a second, weaker copy of the same guarantee would invite the two to disagree.
 *
 * **Declared between `regrasXp` and `missaoSubmissao`** (`regrasXp → missao → missaoSubmissao
 * → xpLedger`). Seeding walks `SCOPE_REGISTRY` forward and `resetWorld` deletes in reverse, so
 * a collection is declared before anything pointing at it — and a submission names a mission.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here.
 * Registration in `payload.config.ts` and the `SCOPE_REGISTRY` entry land together in **T028**:
 * `registry.test.ts` diffs config against registry in both directions, so the two cannot be
 * added separately.
 */
export const Missao: CollectionConfig = {
  slug: 'missao',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Locking is
  // ON by default (the predicate is `lockDocuments !== false`), so the leak reopens by
  // omission rather than by an edit. Same switch, same reason, as `skill` and `regrasXp`.
  lockDocuments: false,
  labels: {
    singular: 'Missão',
    plural: 'Missões',
  },
  admin: {
    // Also what a relationship picker renders: `missaoSubmissao.missao` points here, and
    // without this the review queue offers the reviewer database ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'skill', 'status', 'updatedAt'],
    description:
      'Missões desta organização. Publicadas pela equipe; a conclusão é validada na fila de revisão e concede 1 XP na skill da missão.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-019, CF-9). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('missao')],
  access: {
    // Read is every member's — the missions page and the Home cards render for any signed-in
    // maker. A constraint, never a boolean (FR-006): a boolean authorises the operation and
    // then leaks every row, here the neighbouring lab's catalogue. The signed-out visitor of
    // FR-024 never reaches this function at all; they are served by `getPublicScopedPayload`,
    // which goes *around* collection access because the plugin AND-s
    // `{ tenant: { in: userTenantIDs } }` onto whatever we return.
    read: scopedAccess(),
    // Curating the catalogue is the lab team's, scoped to their own lab. A maker who could
    // mint a mission could name a skill, publish it and then submit their own completion for
    // it — one write away from minting XP in whichever skill they liked (FR-022).
    create: teamOnly(),
    update: teamOnly(),
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'titulo',
      type: 'text',
      required: true,
      label: 'Título',
      admin: {
        description: 'Ex.: Desafio Corte Laser, Impressão 3D, Bordado Digital.',
      },
    },
    {
      name: 'descricao',
      type: 'textarea',
      required: true,
      label: 'Descrição',
      admin: {
        description:
          'Uma linha, o que a pessoa precisa fazer. Ex.: Crie um chaveiro personalizado com corte a laser.',
      },
      // A textarea rather than richText: `home.md` § MISSÕES EM DESTAQUE renders one line of
      // prose under the title, and a rich-text body would arrive as a Lexical tree the card
      // has nowhere to put.
    },
    {
      name: 'icone',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Ícone',
      admin: {
        description: 'Ícone outline (.svg) exibido no card da missão.',
      },
      // **A relationship, not an icon key** (D3 as revised, 2026-09-07) — the same reasoning
      // `categoriaModelo.icone` and `maquina.icone` carry: a key would name an icon set that
      // lives nowhere in this codebase, while `midiaImagem` already carries the `.svg`
      // allowlist and the `validateSvg` script check. Required because every mission card in
      // `home.md` draws one, and a card with a hole where the icon goes is the state nobody
      // notices until it is in front of a visitor.
      //
      // Scoped → scoped, so the shared validator and never a local reimplementation: spike S4c
      // measured the plugin ACCEPTING a write that points at another lab's row.
      validate: sameTenant,
    },
    {
      name: 'skill',
      type: 'relationship',
      relationTo: 'skill',
      required: true,
      label: 'Skill',
      admin: {
        description: 'A skill creditada quando a equipe aprovar a conclusão desta missão.',
      },
      // **Required here, unlike the same-named field on the four publishables.** CLR-009 made
      // `projeto.skill` and its siblings nullable because content published before this
      // feature names no skill and still credits the maker's total. A mission has neither that
      // history nor that fallback: FR-022 credits *"the skill the mission names"*, so a
      // mission with none is an approval with nowhere to put the XP — the credit path would
      // have to refuse it or silently downgrade it, in front of a maker who already did the
      // work and uploaded the proof.
      //
      // `sameTenant` also enforces that `required` floor: a declared `validate` REPLACES
      // Payload's default (`sanitize.js`), and `validations.relationship` is what normally
      // implements `required` — so the composition lives inside the shared validator rather
      // than being remembered at each call site.
      validate: sameTenant,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'rascunho',
      label: 'Status',
      options: [
        { label: 'Rascunho', value: 'rascunho' },
        { label: 'Publicada', value: 'publicado' },
      ],
      admin: {
        description: 'Só missões publicadas aparecem para os makers e para quem não tem conta.',
      },
      // **`publicado`, spelled exactly like that, is load-bearing.** The anonymous path admits
      // a scoped collection only through `derivePublishable`, which is literally
      // `flattenAllFields(...).some(f => f.name === 'status')`, and then filters
      // `{ status: { equals: 'publicado' } }`. A `publicada: checkbox` would fail **closed**:
      // `assertPubliclyReadable` throws `PublicReadDeniedError` for a scoped collection with
      // no `status`, so the mission page would answer a refusal to precisely the signed-out
      // visitor FR-024 is written about. A feminine `publicada` *value* would fail the same
      // way one level down — the filter would match zero rows and the page would be empty.
      //
      // Two states, not the review queue's three: the queue reviews **submissions**
      // (`missaoSubmissao`, T027), not the mission itself, which the team writes and publishes
      // directly. `required` with a default so no row can answer `undefined` to that filter —
      // invisible to `equals` and to a `not_equals` audit alike, which is how a mission goes
      // missing with nothing to point at.
    },
  ],
}
