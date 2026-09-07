import type { CollectionConfig, CollectionSlug } from 'payload'

import { stampApproval } from '../../lib/content/review'
import { canPublishField, scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'
import { ALLOWED_EXTENSIONS } from '../../lib/uploads/limits'
import { deriveFormatos, MODELO_FILE_TARGETS } from './formatos'
import { downloadEndpoint } from './Projeto'

/**
 * A relation target whose collection **exists but is not registered yet**.
 *
 * Same helper, same reason as `Artigo.ts`: `relationTo` is typed against `CollectionSlug`,
 * which Payload derives from the *generated* `payload-types.ts`, and generation follows
 * registration — T044's single edit. So `categoriaModelo` and `perfilMaker` are absent from
 * that union on a machine carrying a file generated before this phase; in CI the file does
 * not exist, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot smuggle a *wrong* slug past anything that matters:
 * Payload resolves `relationTo` at config load and throws `InvalidFieldRelationship` for a
 * target that is genuinely missing. Delete it once the twelve are registered and the types
 * are regenerated.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

/**
 * The options `formatos` may hold — **derived from the upload allowlists, never retyped.**
 *
 * A `select` refuses a value that is not an option, so a list narrower than what a file can
 * actually be would fail the save of a model whose files the upload policy already accepted:
 * the CMS refusing a file the storage layer took, and refusing it inside a hook the maker
 * cannot see. Deriving from `lib/uploads/limits.ts` also means widening a group's allowlist
 * cannot leave this list behind.
 *
 * The population `biblioteca-3d.md` § question 3 expects — STL, 3MF, OBJ, GLTF/GLB, ZIP — is
 * a subset of this by construction: it is what `arquivosModelo` can point at.
 */
const FORMATO_OPTIONS = [
  ...new Set([...ALLOWED_EXTENSIONS.model3d, ...ALLOWED_EXTENSIONS.document]),
]
  .sort()
  .map((extension) => ({ label: extension.replace('.', '').toUpperCase(), value: extension }))

/**
 * A model published at **one** lab (FR-001, FR-020, FR-021, T039) — the third collection off
 * the `projeto` template, and the one that adds FR-020's non-counter derived value.
 *
 * Every field traces to `biblioteca-3d.md` § Modelo de conteúdo. Three carry names or shapes
 * the page table does not, and each time the spec overrules the page:
 *
 *   - **`autor` points at `perfilMaker`, not `usuario`.** The page predates CLR-002, which
 *     split identity from profile: level, XP and skills are per-organization, so one person
 *     making at two labs has one login and two profiles. `data-model.md` lists this
 *     relationship among those needing `sameTenant`, which is only meaningful against a
 *     scoped target. `perfilMaker` is T042, landing in this same phase.
 *   - **`xp_concedido` is `aprovacaoRegistrada` + `aprovadoEm`.** CLR-001 gives this feature
 *     the idempotent *record* and feature 005 the ledger; a per-collection field name would
 *     make feature 005 read two shapes for one guarantee.
 *   - **`publicado_em` is `dataPublicacao`**, as on `projeto` and `artigo`. The public reader
 *     sorts every content collection by it, and one name is what lets it.
 *
 * **`formatos` is derived, not entered** (FR-020). `deriveFormatos` recomputes it from the
 * extensions of `arquivosModelo` on every save; the field is `admin.readOnly` for the admin's
 * half of that, and the hook overwrites whatever a request sent for the API's half — the
 * lesson CLR-001 recorded on the approval stamp, where `admin.readOnly` alone stopped nothing.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** A public visitor never
 * reaches this function: they are served by `getPublicScopedPayload`, which goes *around*
 * collection access, because the multi-tenant plugin AND-s its own tenant constraint onto
 * whatever we return and would nullify a public branch (plan § Sketch 2). The open download
 * of FR-015 is served by the endpoint below, not by access. `create` and `update` are
 * `scopedAccess()` rather than `teamOnly()` because the review queue is the gate (FR-008):
 * any signed-in maker publishes into it, the team approves, and the approval is guarded one
 * level down on `status`.
 *
 * Registration — the config list, the plugin's `collections` map and `SCOPE_REGISTRY` — is
 * T044's single edit; see `CategoriaModelo.ts` for why it is not made here.
 *
 * **Declared elsewhere, on purpose:**
 *   - `parametros_impressao` (material, altura de camada, suporte) and `licenca`, both marked
 *     **(proposta)** in `biblioteca-3d.md` and neither rendered by any surface this feature
 *     ships. Adding a group or an optional select later is an additive migration.
 *   - `skills_relacionadas` and the mission hooks, whose targets belong to feature 005 —
 *     Payload throws at config load for a `relationTo` naming a collection that does not
 *     exist (spec § D2).
 */
export const Modelo3d: CollectionConfig = {
  slug: 'modelo3d',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). Payload's
  // `checkDocumentLockStatus` reads `lockDocuments !== false` and returns before it touches
  // the database, so this is the framework's supported switch rather than a workaround. The
  // cost is priced in CLR-004: no "someone else is editing this" warning on the shared admin.
  lockDocuments: false,
  // Two collection hooks, and the order is not incidental. `stampApproval` runs first because
  // it reads the transition (`data.status` against `originalDoc.status`) and must see the
  // write as the request shaped it; `deriveFormatos` then rewrites one field neither the
  // request nor the stamp has any claim on. Both run AFTER field access has stripped a
  // publish the writer may not make (Payload orders them `beforeValidate fields →
  // beforeValidate collection → beforeChange collection → beforeChange fields`), which is
  // also why a `required` field a hook fills is filled in time: validation is in that last
  // stage, measured in `collections/operations/create.js:93-138`.
  hooks: {
    beforeChange: [stampApproval, deriveFormatos],
  },
  labels: {
    singular: 'Modelo 3D',
    plural: 'Modelos 3D',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): without it the admin offers ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'categoria', 'autor', 'status', 'dataPublicacao'],
    description: 'Modelos da Biblioteca 3D. Publicados por makers, aprovados pela equipe.',
    group: 'Conteúdo',
  },
  // Two surfaces, both required rather than decorative: `/mine` is what `isolation.test.ts`
  // asserts a scoped collection against, and the download route is what makes FR-015 true
  // outside the test harness — "baixar não exige conta, e os downloads anônimos são contados"
  // (PO, 2026-08-24) is this page's headline decision. The route factory is `projeto`'s,
  // imported rather than copied: a copy that forgets the host-resolved tenant is FR-016
  // quietly ceasing to hold for this collection.
  endpoints: [scopedListEndpoint('modelo3d'), downloadEndpoint('modelo3d', 'arquivosModelo')],
  access: {
    read: scopedAccess(),
    create: scopedAccess(),
    update: scopedAccess(),
    // Deleting is the team's: a maker who could delete could erase the review trail the
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
        description: 'Exibido em caixa alta no card (ex.: BOLSA VAZADA).',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: 'URL pública: /biblioteca-3d/{slug}. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'descricaoCurta',
      type: 'textarea',
      required: true,
      // "texto (máx. ~120 caracteres) — 2 linhas no card". Unbounded, the 2x5 grid breaks on
      // the first maker who pastes a paragraph, and it breaks in feature 003 rather than here.
      maxLength: 120,
      label: 'Descrição curta',
      admin: {
        description: 'Até 120 caracteres — duas linhas no card.',
      },
    },
    {
      name: 'descricaoCompleta',
      type: 'richText',
      label: 'Descrição completa',
      admin: {
        description: 'Corpo da página de detalhe do modelo.',
      },
      // Lexical, wired in `payload.config.ts` — spec.md § Decisions settles the stack question
      // in writing: choosing the framework's own default adds nothing to the stack.
    },
    {
      name: 'thumbnail',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Thumbnail',
      admin: {
        description: 'Render do modelo. Fundo navy dentro do card branco.',
      },
      // A relationship, not a text key (D3 as revised, 2026-09-07): the database knows the
      // file has an owner, deleting a referenced image is refused rather than silently
      // orphaning a card, and the download route reads media *through* this document.
      validate: sameTenant,
    },
    {
      name: 'galeria',
      type: 'relationship',
      relationTo: 'midiaImagem',
      hasMany: true,
      label: 'Galeria',
      admin: {
        description: 'Imagens adicionais da página de detalhe.',
      },
      validate: sameTenant,
    },
    {
      name: 'arquivosModelo',
      // Polymorphic, exactly as `projeto.arquivos`: `biblioteca-3d.md` lists
      // `.stl .3mf .obj .gltf .glb .zip`, and `.zip` is on the **document** group's allowlist
      // rather than the 3D group's (`lib/uploads/limits.ts`) because the two groups carry
      // different caps — 100 MB against 200 MB. One field over both collections keeps that
      // split without asking the maker to know about it.
      type: 'relationship',
      relationTo: [...MODELO_FILE_TARGETS],
      hasMany: true,
      required: true,
      label: 'Arquivos do modelo',
      admin: {
        description: 'Malhas e pacotes imprimíveis. O download é aberto e é contado (FR-016).',
      },
      // `normalizeRefs` handles the `{ relationTo, value }` shape a polymorphic relationship
      // arrives in — it was written for exactly this, and `deriveFormatos` reuses it.
      validate: sameTenant,
    },
    {
      name: 'arquivoPreview3d',
      type: 'relationship',
      relationTo: 'midiaModelo3d',
      label: 'Arquivo de pré-visualização 3D',
      admin: {
        description: '.glb ou .gltf para o visualizador web. Opcional (proposta).',
      },
      validate: sameTenant,
    },
    {
      name: 'documentacao',
      type: 'relationship',
      relationTo: 'midiaDocumento',
      label: 'Documentação',
      admin: {
        description: 'Guia de impressão ou montagem em .pdf. Opcional (proposta).',
      },
      validate: sameTenant,
    },
    {
      name: 'formatos',
      type: 'select',
      hasMany: true,
      options: FORMATO_OPTIONS,
      label: 'Formatos',
      admin: {
        readOnly: true,
        description: 'Derivado das extensões dos arquivos enviados. Mantido pelo sistema.',
      },
      // FR-020's fourth derived value. **Not `required`**, although the page table marks it
      // obrigatório: it is written by `deriveFormatos` from `arquivosModelo`, which IS
      // required, so the only way to reach an empty list is a reference the scoped client
      // cannot resolve — a foreign or deleted upload. `sameTenant` refuses that write with a
      // message naming the offending field; a `required` error here would compete for the
      // failure and point the maker at a field they cannot edit.
    },
    {
      name: 'categoria',
      type: 'relationship',
      relationTo: pendingSlug('categoriaModelo'),
      required: true,
      label: 'Categoria',
      admin: {
        description: 'Alimenta a barra lateral e o contador de modelos da categoria.',
      },
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a cross-tenant
      // write on its own. The shared validator, never a local reimplementation: FR-007 is a
      // guarantee only while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'autor',
      type: 'relationship',
      relationTo: pendingSlug('perfilMaker'),
      required: true,
      label: 'Autor',
      admin: {
        description: 'Perfil maker desta organização: avatar, nome, @handle e nível no card.',
      },
      validate: sameTenant,
    },
    {
      name: 'nivelDificuldade',
      type: 'select',
      options: [
        { label: 'Iniciante', value: 'iniciante' },
        { label: 'Intermediário', value: 'intermediario' },
        { label: 'Avançado', value: 'avancado' },
      ],
      label: 'Nível de dificuldade',
      admin: {
        description: 'Alimenta o filtro "Todos os níveis". Escala provisória (proposta).',
      },
      // **Optional, although the page table marks it obrigatório**, and the deviation is the
      // page's own doing: `biblioteca-3d.md` marks the scale **(proposta)** — "escala a
      // definir" — and leaves open question 2 unresolved (whether that filter means the
      // model's difficulty or the author's level). Declaring the field gives the filter a
      // subject and keeps the migration additive; *requiring* it would force every maker to
      // answer, in a vocabulary this file invented, a question the PO has not decided. If the
      // scale changes, an optional column is edited; a required one has to be backfilled.
    },
    {
      name: 'curtidas',
      type: 'number',
      required: true,
      // Stored rather than counted on read: the 2x5 card grid would otherwise pay an N+1 per
      // page (`lib/content/counters.ts` owns the strategy). Zero, never null — a card
      // rendering `null ♥` is the bug a nullable counter always eventually produces.
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
        description: 'Fila de revisão: o maker publica, a equipe aprova. O XP credita na aprovação.',
      },
      // Three states rather than Payload's native drafts, which model only two — the middle
      // one *is* the review queue (FR-008). The guard lives on the field because that is the
      // only layer Payload hands the incoming value to: a document-level guard can only
      // answer "may this maker write this model at all", where both answers are wrong.
      // `create` as well as `update`, because Payload evaluates field access per operation
      // and a POST arriving with `status: 'publicado'` never meets the update guard.
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
      // `admin.readOnly` is admin-UI cosmetics and stops nothing coming through the API:
      // without field access a maker refused `status: 'publicado'` could still POST this flag
      // on a `rascunho` and write themselves the record feature 005 credits XP from (CLR-001),
      // and the hook's "never cleared" rule would then preserve the forgery. `false` for every
      // request, master included: the value is a record of a transition, and only the code
      // performing the transition may write it. Collection hooks run after field access.
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
      // The date half of the same approval record, guarded for the same reason: a forged date
      // is what makes a forged approval look like a real one to feature 005.
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
      // Optional although the page marks `publicado_em` obrigatório: a `rascunho` has no
      // publication date to carry, and requiring one would make the queue's first state
      // unwritable. It is set when the team publishes, which is the only moment it has a value.
      label: 'Data de publicação',
      admin: {
        description: 'Preenchida na publicação. Ordena a listagem "Mais recentes".',
      },
    },
  ],
}
