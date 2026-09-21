import type { CollectionConfig } from 'payload'

import { offeredSkills } from '../../lib/content/skill-catalogue'
import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A challenge **one** lab publishes for its makers (T026, FR-020, FR-028).
 *
 * FR-020 names five things and this file carries those: a title, a description, an
 * icon, **the skill it credits**, and a published state — plus the two curation fields FR-001
 * added in 006: `destaqueHome`, which features a mission on the Home and does **not** publish it
 * (a second switch on the same row, deliberately separate from `status`), and `ordemDestaque`,
 * the band's declared order — *menor primeiro, empates pelo título* (FR-003). What a maker *did*
 * about a mission is
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
      // **The retired skill is not on offer here** (FR-019, T038): the active catalogue,
      // plus whatever this document already names — `lib/content/skill-catalogue.ts` records
      // why the second half is not optional, and why a static filter would brick every
      // publication that ever credited a skill the lab later retired.
      filterOptions: offeredSkills('missao'),
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
    {
      name: 'destaqueHome',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: 'Destaque na Home',
      admin: {
        description:
          'Mostra esta missão na faixa MISSÕES EM DESTAQUE da Home. Não publica: uma missão em ' +
          'rascunho continua invisível para quem não é da equipe.',
      },
      // **The curation switch, and the second switch on this row** (FR-001, CLR-004). It decides
      // *which* published missions the Home features; `status` above decides whether anyone
      // outside the team sees the mission at all. Keeping them apart is what lets the team line
      // up a draft for the band without publishing it by accident — and the `admin.description`
      // is where that separation reaches the person holding the checkbox, because the obvious
      // reading of "Destaque na Home" is "put this on the Home".
      //
      // The band never re-states the published filter: `missao` is publishable, so the anonymous
      // door adds `status = publicado` itself and the query carries only `destaqueHome` (D4).
      //
      // `required: true` **with** a `defaultValue` of `false` — the shape `skill.ativa` already
      // uses. On a checkbox that pair means *"must carry a boolean"*: required alone would
      // refuse every mission that predates this field, and a default alone would still let a row
      // answer `null`, which is invisible to `equals: true` and to a `not_equals` audit alike.
      // The flag and the migration must agree on that NOT NULL — `push` rebuilds non-production
      // schemas from this config, so a mismatch reopens as permanent drift.
    },
    {
      name: 'ordemDestaque',
      type: 'number',
      label: 'Ordem no destaque',
      admin: {
        description: 'Menor primeiro. Empates pelo título.',
      },
      // **The band's declared order** (FR-001, FR-003). The read sorts `['ordemDestaque',
      // 'titulo']` — an ARRAY, because the comma form orders by nothing on the local API: drizzle
      // wraps the whole string, resolves no column, swallows the failure and falls back to
      // `-createdAt`. The featured missions would then be the three most recently created, and
      // nothing on screen would say so.
      //
      // **Optional, and with no `defaultValue`.** Both halves are load-bearing. `required` would
      // demand a position from the team for a band of one, where the number means nothing; a
      // `defaultValue: 0` would be worse — every row would answer the same position, collapsing
      // the whole band onto the `titulo` tie-break and silently retiring the field the editor is
      // being asked to fill in. Absent stays absent, and Postgres sorts NULLs last on ASC, so an
      // unordered featured mission falls behind the ordered ones (CHK004) rather than jumping to
      // the front the way a zero default would put it.
      //
      // The `admin.description` is where FR-003's *declared* tie-break reaches the person typing
      // the numbers: two missions sharing an order is the first case they will hit, and without
      // the sentence it reads as a bug rather than as the documented, stable outcome.
    },
  ],
}
