import type { CollectionConfig, CollectionSlug } from 'payload'

import { stampApproval } from '../../lib/content/review'
import { canPublishField, scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'
import { downloadEndpoint } from './Projeto'

/**
 * A relation target whose collection **exists but is not registered yet**.
 *
 * `relationTo` is typed against `CollectionSlug`, which Payload derives from the *generated*
 * `payload-types.ts` — and generation follows registration, which is T044's single edit. So
 * `perfilMaker` is absent from that union on a developer machine carrying a generated file
 * from before this phase (it is: `apps/web/payload-types.ts` lists neither it nor `aula`); in
 * CI the file does not exist at all, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot smuggle a *wrong* slug past anything that matters:
 * Payload resolves `relationTo` at config load and throws `InvalidFieldRelationship` for a
 * target that is genuinely missing, which is the check this defers to rather than replaces.
 * Delete it once the twelve are registered and the types are regenerated. `Artigo.ts` carries
 * the same helper for the same reason; they merge into one when that deletion happens.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

/**
 * A class taught at **one** lab (FR-001, FR-003, FR-021, T040) — the catalogue of
 * `aulas.md`, off the same `projeto` template as `modelo3d` and `artigo`.
 *
 * Every field traces to `aulas.md` § Modelo de conteúdo. Three are named or valued
 * differently from that table, and each time a later decision overrules the page:
 *
 *   - **`autor` points at `perfilMaker`, not `usuario`.** `aulas.md` predates CLR-002, which
 *     split identity from profile: level, XP and skills are per-organization, so one person
 *     teaching at two labs has one login and two profiles. `data-model.md` lists `aula.autor`
 *     among the relationships needing `sameTenant`, which is only meaningful against a scoped
 *     target. `perfilMaker` is T042, landing in this same phase.
 *   - **`nivel_dificuldade` is `Básico · Intermediário · Avançado`** (round 5, 2026-08-24,
 *     repeated in `minha-conta.md` as `25:30 | Básico`), and `Iniciante` is marked superseded
 *     in writing. `modelo3d` carries the `iniciante` scale because `biblioteca-3d.md` still
 *     marks *its* scale **(proposta)** — two collections, two states of the same question.
 *     Do not "align" them without a decision that closes the other one.
 *   - **`publicado_em` is `dataPublicacao`**, as on `projeto`, `modelo3d` and `artigo`: the
 *     public reader sorts every content collection by it, and one name is what lets it.
 *
 * **`xp_recompensa` defaults to 1 and is not the credit.** "1 XP por aula assistida, valor
 * fixo; campo mantido só para exceções futuras" (2026-08-23). CLR-001 keeps the ledger in
 * feature 005; what is stored here is the *amount* it will read, exactly as
 * `aprovacaoRegistrada`/`aprovadoEm` store the *record* that approval happened. The
 * watched-once half lives on `progressoAula`, beside this file.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** A public visitor never
 * reaches this function: they are served by `getPublicScopedPayload`, which goes *around*
 * collection access, because the multi-tenant plugin AND-s its own
 * `{ tenant: { in: userTenantIDs } }` onto whatever we return and would nullify a public
 * branch (plan § Sketch 2). So an anonymous read here is a flat refusal, not a
 * published-only filter — and `derivePublishable` picks this collection up from its `status`
 * field, so publishing works without an allowlist anyone has to remember to extend. The open,
 * account-free download of FR-015 is served by the endpoint below, not by access.
 *
 * `create` and `update` are `scopedAccess()` rather than `teamOnly()` because the review
 * queue is the gate (FR-008): any signed-in maker submits, the team approves. The approval is
 * guarded one level down, on the `status` field — a collection-level write guard cannot
 * distinguish "submit for review" from "publish".
 *
 * Registration — the config list, the plugin's `collections` map and `SCOPE_REGISTRY` — is
 * T044's single edit: `registry.test.ts` diffs the two in both directions and fails the build
 * whenever they disagree, so config registration and registry entry cannot land separately.
 *
 * **Declared elsewhere, on purpose:**
 *   - **`skill`**, which `aulas.md` marks **(proposta)** and whose target collection belongs
 *     to feature 005 (FR-022 as amended by D2 — a `relationTo` cannot name a collection that
 *     does not exist; Payload throws `InvalidFieldRelationship` at config load).
 *   - **The like itself.** The heart on an aula is a `curtida` row (T043); `curtidas` here is
 *     the counter a card renders, maintained in the same transaction (`data-model.md`
 *     § Derived values). `curtida.conteudo` gains `aula` as a target when both are registered.
 */
export const Aula: CollectionConfig = {
  slug: 'aula',
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
  // approval through SC-004. A hook that is written but never registered stamps nothing.
  hooks: {
    beforeChange: [stampApproval],
  },
  labels: {
    singular: 'Aula',
    plural: 'Aulas',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): `progressoAula.aula` points here, and
    // without this the admin offers ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'ordem', 'autor', 'status', 'dataPublicacao'],
    description: 'Aulas desta organização. Gravadas pela comunidade, publicadas pela equipe.',
    group: 'Conteúdo',
  },
  // Two surfaces, both required rather than decorative: `/mine` is what `isolation.test.ts`
  // asserts a scoped collection against, and the download route is what makes FR-015 true
  // outside the test harness for `materiais` — "download aberto, sem conta" (PO, 2026-08-24).
  // The route factory is `projeto`'s, imported rather than copied: the day a copy forgets the
  // host-resolved tenant is the day FR-016 stops holding here.
  endpoints: [scopedListEndpoint('aula'), downloadEndpoint('aula', 'materiais')],
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
        description: 'Exibido em caixa alta no card (PRIMEIROS PASSOS IMPRESSÃO 3D).',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: 'URL pública: /aulas/{slug}. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'descricao',
      type: 'textarea',
      required: true,
      // "texto (máx. ~140 car.) — 2 linhas no card". Unbounded, the catalogue grid breaks on
      // the first author who pastes a paragraph, and it breaks in feature 003 rather than here.
      maxLength: 140,
      label: 'Descrição',
      admin: {
        description: 'Até 140 caracteres — duas linhas no card.',
      },
    },
    {
      name: 'thumbnail',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Thumbnail',
      admin: {
        description: 'Proporção ~5:3 no desktop e 16:9 no mobile. Enviada para a biblioteca de imagens desta organização.',
      },
      // A relationship, not a text key (D3 as revised 2026-09-07): the media collection is
      // where the group's cap and allowlist live, so a thumbnail inherits the image rules by
      // construction; the database knows the file has an owner, so deleting a referenced image
      // is refused rather than silently blanking a card; and the download route reads the
      // media document *through* the aula, needing no anonymous read of the media collection.
      validate: sameTenant,
    },
    {
      name: 'videoUrl',
      type: 'text',
      required: true,
      label: 'URL do vídeo',
      admin: {
        description: 'YouTube, Vimeo ou arquivo hospedado. É o que o player carrega.',
      },
      // Text, not an upload relationship: `aulas.md` marks the field "URL / embed" and the
      // decided delivery is a third-party embed. A hosted file arrives as its URL too, so one
      // field serves both without the media collections having to accept video — which they
      // deliberately do not (`data-model.md` § Upload fields lists three groups, none of them
      // video, and a 100 MB cap no lecture recording would fit under).
    },
    {
      name: 'duracaoMin',
      type: 'number',
      required: true,
      min: 0,
      label: 'Duração',
      admin: {
        description: 'Em minutos. Exibida como "n min" no card.',
      },
    },
    {
      name: 'ordem',
      type: 'number',
      required: true,
      min: 0,
      // The catalogue is a numbered sequence (`01`–`08`), so it is read sorted by this on
      // every listing.
      index: true,
      label: 'Ordem',
      admin: {
        description: 'Numeração da trilha: 01, 02, 03… Ordena a listagem.',
      },
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
      // Scoped → scoped (CLR-002), so the same-tenant rule applies: a profile belongs to the
      // lab it was made at. The shared validator, never a local reimplementation — FR-007 is a
      // guarantee only while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'nivelDificuldade',
      type: 'select',
      options: [
        { label: 'Básico', value: 'basico' },
        { label: 'Intermediário', value: 'intermediario' },
        { label: 'Avançado', value: 'avancado' },
      ],
      label: 'Nível de dificuldade',
      admin: {
        description: 'Exibido em Cursos assistidos da Minha Conta (ex.: 25:30 | Básico).',
      },
      // Optional, exactly as `aulas.md` marks it ("não") — unlike `modelo3d`, where the same
      // field is optional *despite* the page requiring it. Here the page and the file agree.
    },
    {
      name: 'xpRecompensa',
      type: 'number',
      required: true,
      // Fixed at 1 (2026-08-23): "1 XP por aula assistida; campo mantido só para exceções
      // futuras". The field exists so an exception does not need a migration; the default is
      // what makes every aula worth the same without anyone typing it.
      defaultValue: 1,
      min: 0,
      label: 'XP de recompensa',
      admin: {
        description: 'XP concedido ao assistir a aula inteira. Padrão 1 — economia decidida em 2026-08-23.',
      },
    },
    {
      name: 'materiais',
      // Polymorphic: `aulas.md` lists ".pdf .zip .stl .3mf .obj .gltf .glb .svg .dxf", which
      // spans meshes AND documents, and those live in different media collections because each
      // group carries its own cap and allowlist. One field over two targets keeps that split
      // without asking the author to know about it.
      type: 'relationship',
      relationTo: ['midiaModelo3d', 'midiaDocumento'],
      hasMany: true,
      label: 'Materiais',
      admin: {
        description: 'Materiais de apoio. O download é aberto, sem conta, e é contado (FR-015).',
      },
      // `normalizeRefs` already handles the `{ relationTo, value }` shape a polymorphic
      // relationship arrives in — it was written for exactly this.
      validate: sameTenant,
    },
    {
      name: 'transcricao',
      type: 'textarea',
      label: 'Transcrição',
      admin: {
        description: 'Texto do vídeo, para acessibilidade e busca.',
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
      // The counter `downloadEndpoint` increments for `materiais`, on the strategy
      // `data-model.md` § Derived values gives all four.
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
        description: 'Fila de revisão: o autor envia, a equipe publica. Só em publicado a aula aparece no catálogo.',
      },
      // Three states rather than Payload's native drafts, which model only two — the middle
      // one *is* the review queue (FR-008), and `versions: { drafts: true }` has nowhere to put
      // "submitted, awaiting the team".
      //
      // The guard lives **here, on the field**, because this is the only layer Payload hands
      // the incoming value to: the collection's `update` is `scopedAccess()` on purpose, and a
      // document-level guard can only answer "may this maker write this aula at all", where
      // both answers are wrong — `false` seals the queue the author is supposed to fill, `true`
      // lets them publish.
      //
      // **`create` as well as `update`**: Payload evaluates field access per operation, so a
      // POST arriving with `status: 'publicado'` on a brand new document never meets the update
      // guard at all. Guarding only updates would leave the shorter path open.
      access: {
        create: canPublishField,
        update: canPublishField,
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
      // stops from setting `status: 'publicado'` — could still POST `aprovacaoRegistrada: true`
      // on a `rascunho` and write themselves the approval record. That pair IS the artifact
      // feature 005 reads to credit XP (CLR-001), so the guard on `status` would be fenced
      // around through the field that carries the credit. Worse, the hook's "never cleared"
      // rule then preserves the forgery, so the genuine publication is never dated. This defect
      // was measured on `projeto` in round 5, not imagined.
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
      // the same reasoning as `aprovacaoRegistrada` above, and the same reason it is not merely
      // `admin.readOnly`: without the date, a forged flag leaves the genuine publication
      // undated and feature 005 cannot tell the two apart.
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
      // Optional although `aulas.md` marks `publicado_em` obrigatório, for the reason `projeto`
      // records: a `rascunho` has no publication date to carry, and requiring one would make
      // the queue's first state unwritable. It is set when the team publishes.
      label: 'Data de publicação',
      admin: {
        description: 'Preenchida na publicação. Ordenação alternativa à ordem da trilha.',
      },
    },
  ],
}
