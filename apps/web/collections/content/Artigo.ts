import type { CollectionConfig, CollectionSlug } from 'payload'

import { stampApproval } from '../../lib/content/review'
import { canPublishField, scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'
import { downloadEndpoint } from './Projeto'

/**
 * An article written at **one** lab (FR-001, FR-021, T038) — the second collection off the
 * `projeto` template T037 accepted, and the first proof that the template travels.
 *
 * Every field below traces to `artigos.md` § Modelo de conteúdo. Two of them are named
 * differently from that table, and both times the spec overrules the page:
 *
 *   - **`autor` points at `perfilMaker`, not `usuario`.** `artigos.md` predates CLR-002,
 *     which split identity from profile: level, XP and skills are per-organization, so one
 *     person making at two labs has one login and two profiles. `data-model.md` lists
 *     `artigo.autor` among the relationships needing `sameTenant`, which is only meaningful
 *     against a scoped target. `perfilMaker` is T042, landing in this same phase — T044,
 *     which registers both, is blocked on both.
 *   - **`xp_concedido` is `aprovacaoRegistrada` + `aprovadoEm`.** CLR-001 gives this feature
 *     the idempotent *record* and feature 005 the ledger, so what is stored here is "this
 *     article has already credited", exactly as `projeto` stores it. A per-collection field
 *     name would make feature 005 read two shapes for one guarantee.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** A public visitor never
 * reaches this function: they are served by `getPublicScopedPayload`, which goes *around*
 * collection access, because the multi-tenant plugin AND-s its own
 * `{ tenant: { in: userTenantIDs } }` onto whatever we return and would nullify a public
 * branch (plan § Sketch 2). So an anonymous read here is a flat refusal, not a
 * published-only filter — and `derivePublishable` picks this collection up from its `status`
 * field, so publishing works without an allowlist anyone has to remember to extend.
 *
 * `create` and `update` are `scopedAccess()` rather than `teamOnly()` because the review
 * queue is the gate (FR-008): any signed-in maker submits, the team approves. The approval
 * is guarded one level down, on the `status` field — a collection-level write guard cannot
 * distinguish "submit for review" from "publish".
 *
 * Registration — the config list, the plugin's `collections` map and `SCOPE_REGISTRY` — is
 * T044's single edit; see `CategoriaArtigo.ts` for why it is not made here.
 *
 * **Declared elsewhere, on purpose:** `skills_relacionadas`, marked **(proposta)** in
 * `artigos.md` § Ganchos, whose target `skill` belongs to feature 005 (FR-022 as amended by
 * D2 — a `relationTo` cannot name a collection that does not exist).
 */
/**
 * A relation target whose collection **exists but is not registered yet**.
 *
 * `relationTo` is typed against `CollectionSlug`, which Payload derives from the *generated*
 * `payload-types.ts` — and generation follows registration, which is T044's single edit
 * (see the docstring below). So `categoriaArtigo` and `perfilMaker` are absent from that
 * union on a developer machine carrying a generated file from before this phase; in CI the
 * file does not exist at all, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot be used to smuggle a *wrong* slug past anything that
 * matters: Payload resolves `relationTo` at config load and throws `InvalidFieldRelationship`
 * for a target that is genuinely missing, which is the check this defers to rather than
 * replaces. Delete it once the twelve are registered and the types are regenerated.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

export const Artigo: CollectionConfig = {
  slug: 'artigo',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). Payload's
  // `checkDocumentLockStatus` reads `lockDocuments !== false` and returns before it touches
  // the database, so this is the framework's supported switch rather than a workaround. The
  // cost is priced in CLR-004: no "someone else is editing this" warning on the shared admin.
  lockDocuments: false,
  // The approval record of FR-009/SC-004, registered here so it runs after field access has
  // already stripped a publish the writer may not make (Payload orders them
  // `beforeValidate fields → beforeValidate collection → beforeChange collection`). A maker's
  // refused hop therefore never reaches the hook as `publicado`, and SC-005 cannot leak an
  // approval through SC-004. The decision lives in `lib/content/review.ts` and is proven
  // there; a hook that is written but never registered stamps nothing.
  hooks: {
    beforeChange: [stampApproval],
  },
  labels: {
    singular: 'Artigo',
    plural: 'Artigos',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): without it the admin offers ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'categoria', 'autor', 'status', 'dataPublicacao'],
    description: 'Artigos desta organização. Escritos pela comunidade, publicados pela equipe.',
    group: 'Conteúdo',
  },
  // Two surfaces, both required rather than decorative: `/mine` is what `isolation.test.ts`
  // asserts a scoped collection against, and the download route is what makes FR-015 true
  // outside the test harness for this collection's `anexos`. The route factory is `projeto`'s,
  // imported rather than copied — the day a copy forgets the host-resolved tenant is the day
  // FR-016 stops holding here. (Its docstring anticipates this second caller and the move to
  // `lib/content/`; that move touches `Projeto.ts` and its tests, which T038 does not own.)
  endpoints: [scopedListEndpoint('artigo'), downloadEndpoint('artigo', 'anexos')],
  access: {
    read: scopedAccess(),
    create: scopedAccess(),
    update: scopedAccess(),
    // Deleting is the team's: an author who could delete could erase the review trail the
    // approval stamp is supposed to make permanent.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'titulo',
      type: 'text',
      required: true,
      label: 'Título',
      admin: {
        description: 'Exibido em caixa alta no card, até duas linhas.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: 'URL pública: /artigos/{slug}. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'resumo',
      type: 'textarea',
      required: true,
      // "texto longo (máx. ~160 caracteres) — duas linhas no card". Unbounded, the card grid
      // breaks on the first author who pastes a paragraph, and it breaks in feature 003.
      maxLength: 160,
      label: 'Resumo',
      admin: {
        description: 'Até 160 caracteres — duas linhas no card.',
      },
    },
    {
      name: 'corpo',
      type: 'richText',
      required: true,
      label: 'Corpo',
      admin: {
        description: 'Conteúdo do artigo, com imagens e links.',
      },
      // Lexical, wired in `payload.config.ts`. spec.md § Decisions settles this in writing:
      // Principle 1 asks for justification to *add* to the stack, and choosing the
      // framework's own default adds nothing, whereas markdown would add an editor, a
      // renderer and a sanitiser. `artigos.md` marks it "rich text / markdown"; this is the
      // half the spec chose.
    },
    {
      name: 'capa',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Capa',
      admin: {
        description: 'Ilustração ~3:2 enviada para a biblioteca de imagens desta organização.',
      },
      // A relationship, not a text key (D3 as revised 2026-09-07): the media collection is
      // where the group's cap and allowlist live, so a cover inherits the image rules by
      // construction; the database knows the file has an owner, so deleting a referenced
      // image is refused rather than silently blanking a card; and the download route reads
      // the media document *through* the artigo, needing no anonymous read of the media
      // collection at all.
      validate: sameTenant,
    },
    {
      name: 'categoria',
      type: 'relationship',
      relationTo: pendingSlug('categoriaArtigo'),
      required: true,
      label: 'Categoria',
      admin: {
        description: 'Alimenta o chip do card e as tabs de /artigos. Uma por artigo.',
      },
      // Both sides are scoped, so without this an artigo can point at another lab's
      // vocabulary — and spike S4c measured the plugin ACCEPTING such a write on its own.
      // The shared validator, never a local reimplementation: FR-007 is a guarantee only
      // while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'autor',
      type: 'relationship',
      relationTo: pendingSlug('perfilMaker'),
      required: true,
      label: 'Autor',
      admin: {
        description: 'Perfil exibido no rodapé do card: nome, @handle e nível.',
      },
      // Scoped → scoped (CLR-002), so the same-tenant rule applies exactly as it does to
      // `categoria`: a profile belongs to the lab it was made at.
      validate: sameTenant,
    },
    {
      name: 'anexos',
      // Polymorphic: `artigos.md` lets an article attach meshes AND documents
      // (.stl .3mf .obj .gltf .glb alongside .pdf .zip), and those live in different media
      // collections because each group carries its own cap and allowlist. One field over two
      // targets keeps that split without asking the author to know about it.
      type: 'relationship',
      relationTo: ['midiaModelo3d', 'midiaDocumento'],
      hasMany: true,
      label: 'Anexos',
      admin: {
        description: 'Materiais de apoio. O download é aberto, sem conta, e é contado (FR-015).',
      },
      // `normalizeRefs` already handles the `{ relationTo, value }` shape a polymorphic
      // relationship arrives in — it was written for exactly this.
      validate: sameTenant,
    },
    {
      name: 'linkExterno',
      type: 'text',
      label: 'Link externo',
      admin: {
        description: 'Para publicações hospedadas fora do site.',
      },
    },
    {
      name: 'curtidas',
      type: 'number',
      required: true,
      // Stored rather than counted on read: the card grids this design serves would otherwise
      // pay an N+1 per page. Zero, never null — a card rendering `null ♥` is the bug a
      // nullable counter always eventually produces.
      defaultValue: 0,
      min: 0,
      label: 'Curtidas',
      admin: {
        readOnly: true,
        description: 'Derivado das curtidas. Mantido pelo sistema.',
      },
    },
    {
      name: 'downloads',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      label: 'Downloads',
      admin: {
        readOnly: true,
        description: 'Somados inclusive os anônimos. Mantido na mesma transação do download.',
      },
      // Not in `artigos.md`'s field table, but its anexos row decides it: "downloads
      // anônimos são contados". `data-model.md` § Derived values gives the counter the same
      // strategy `projeto` uses, and `downloadEndpoint` above increments this field.
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
      label: 'Tags',
      admin: {
        description: 'Busca e artigos relacionados.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'rascunho',
      label: 'Status',
      options: [
        { label: 'Rascunho', value: 'rascunho' },
        { label: 'Em revisão', value: 'em_revisao' },
        { label: 'Publicado', value: 'publicado' },
      ],
      admin: {
        description: 'Fila de revisão: o autor envia, a equipe publica.',
      },
      // Three states rather than Payload's native drafts, which model only two — the middle
      // one *is* the review queue (FR-008), and `versions: { drafts: true }` has nowhere to
      // put "submitted, awaiting the team".
      //
      // The guard lives **here, on the field**, because this is the only layer Payload hands
      // the incoming value to: the collection's `update` is `scopedAccess()` on purpose, and
      // a document-level guard can only answer "may this maker write this artigo at all",
      // where both answers are wrong — `false` seals the queue the author is supposed to
      // fill, `true` lets them publish.
      //
      // **`create` as well as `update`**: Payload evaluates field access per operation, so a
      // POST arriving with `status: 'publicado'` on a brand new document never meets the
      // update guard at all. Guarding only updates would leave the shorter path open.
      access: {
        create: canPublishField,
        update: canPublishField,
      },
    },
    {
      name: 'tempoLeitura',
      type: 'number',
      min: 0,
      label: 'Tempo de leitura',
      admin: {
        description: 'Em minutos. Exibido na página do artigo.',
      },
    },
    {
      name: 'aprovacaoRegistrada',
      type: 'checkbox',
      defaultValue: false,
      label: 'Aprovação registrada',
      // **Written by `stampApproval` alone, never by a request** (FR-009, SC-004, SC-005).
      //
      // `admin.readOnly` is admin-UI cosmetics: it greys the input and stops nothing coming
      // through the API. Without field access, an author — whom `canPublishField` correctly
      // stops from setting `status: 'publicado'` — could still POST
      // `aprovacaoRegistrada: true` on a `rascunho` and write themselves the approval record.
      // That pair IS the artifact feature 005 reads to credit XP (CLR-001), so the guard on
      // `status` would be fenced around through the field that carries the credit. Worse, the
      // hook's "never cleared" rule then preserves the forgery, so the genuine publication is
      // never dated. This defect was measured on `projeto` in round 5, not imagined.
      //
      // `false` for every request, master included: the value is a *record of a transition*,
      // and the only thing entitled to write it is the code that performs the transition.
      // Collection hooks run after field access and are unaffected.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'Marcado na primeira publicação. Nunca desmarcado.',
      },
    },
    {
      name: 'aprovadoEm',
      type: 'date',
      label: 'Aprovado em',
      // **Written by `stampApproval` alone, never by a request** (FR-009, SC-004, SC-005) —
      // the same reasoning as `aprovacaoRegistrada` above, and the same reason it is not
      // merely `admin.readOnly`: without the date, a forged flag leaves the genuine
      // publication undated and feature 005 cannot tell the two apart.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description: 'Data da primeira aprovação. Uma republicação não a reescreve.',
      },
    },
    {
      name: 'dataPublicacao',
      type: 'date',
      // Optional although `artigos.md` marks it obrigatório, for the reason `projeto` records:
      // a `rascunho` has no publication date to carry, and requiring one would make the
      // queue's first state unwritable. It is set when the team publishes.
      label: 'Data de publicação',
      admin: {
        description: 'Preenchida na publicação. Exibida como 12 MAI 2024 e ordena a listagem.',
      },
    },
  ],
}
