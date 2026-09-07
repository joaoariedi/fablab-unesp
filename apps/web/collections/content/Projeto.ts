import type { CollectionConfig, Endpoint, PayloadRequest } from 'payload'

import { serveDownload } from '../../lib/content/downloads'
import { stampApproval } from '../../lib/content/review'
import { canPublishField, scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { mediaObjectReader } from '../../lib/tenancy/media-objects'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * The same refusal `serveDownload` gives, for a request that never reaches it.
 *
 * Byte-identical on purpose: a malformed path must be indistinguishable from a draft, a foreign
 * organization and an unlisted media document, or the difference is an oracle — the property
 * `downloads.ts` calls its single 404 and run 6 caught being violated across collections.
 */
const notFound = (): Response => Response.json({ error: 'Not found' }, { status: 404 })

/** `path-to-regexp` hands every captured segment through as a string; anything else is a 404. */
const routeSegment = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

/**
 * **The anonymous download route** (FR-015, FR-016, SC-009, T036b).
 *
 * `GET /api/<collection>/:id/download/:midiaId`. Custom collection endpoints are served without
 * authentication, which is exactly what FR-015 asks for: downloads are open, no account
 * required (PO, 2026-08-24). The policy — published-only, host-resolved tenant, the media
 * document read *through* the project, and the counted write — is entirely `serveDownload`'s;
 * this is the registration it lacked. Run 6 recorded the module having **no production caller
 * at all**, which made FR-015 true only inside the test harness.
 *
 * Both ids come from the **path** rather than a body or a query: the route is a link a visitor
 * follows, and a GET with a body is not one.
 *
 * The bytes come from `mediaObjectReader`, which lives in `lib/tenancy` because it touches the
 * unscoped client (FR-024) — the route itself holds nothing that can query anything.
 *
 * A factory rather than a literal, for `scopedListEndpoint`'s reason: `artigo`, `aula` and
 * `modelo3d` carry downloads too (002b), and two copies drift — the day one of them forgets the
 * tenant-resolved host is the day FR-016 stops holding for that collection. It lives here until
 * the second caller lands and moves to `lib/content/` with it.
 */
export function downloadEndpoint(
  collectionSlug: string,
  /**
   * The attachment field on THIS collection. Required, with no default: a default would be
   * `projeto`'s `arquivos`, and the three collections that named the field differently would
   * silently get a route that serves nothing — which is exactly what happened before this
   * parameter existed.
   */
  attachmentField: string,
): Omit<Endpoint, 'root'> {
  return {
    path: '/:id/download/:midiaId',
    method: 'get',
    handler: async (req: PayloadRequest) => {
      const params = (req.routeParams ?? {}) as { id?: unknown; midiaId?: unknown }
      const id = routeSegment(params.id)
      const midiaId = routeSegment(params.midiaId)
      if (!id || !midiaId) return notFound()

      return serveDownload(
        req,
        { collection: collectionSlug, id, midiaId, field: attachmentField },
        { objects: mediaObjectReader(req) },
      )
    },
  }
}

/**
 * A project made at **one** lab (FR-001, FR-021, T024) — and the template the other twelve
 * content collections are copied from, which is why the shape matters more than the fields.
 *
 * Every field below traces to `projetos.md` § Modelo de conteúdo. Nothing is invented, and
 * what that table lists but this file does not declare is enumerated at the bottom of this
 * docstring with the reason and the task that unblocks it — an omission a later reader can
 * check is deliberate is worth more than a field that cannot compile.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** A public visitor never
 * reaches this function: they are served by `getPublicScopedPayload`, which goes *around*
 * collection access rather than through it, because the multi-tenant plugin AND-s its own
 * `{ tenant: { in: userTenantIDs } }` onto whatever we return and would nullify a public
 * branch (plan § Sketch 2, measured in `withTenantAccess.js`). So an anonymous read here is
 * a flat refusal, not a published-only filter — the filter lives in the public client.
 *
 * `create` and `update` are `scopedAccess()` rather than `teamOnly()` because the review
 * queue is the gate: FR-008 says *any* signed-in maker submits and the team approves. The
 * approval itself is guarded one level down, on the `status` field (T027) — a collection-level
 * write guard cannot distinguish "submit for review" from "publish".
 *
 * The `tenant` field is injected by the multi-tenant plugin (and indexed by it), so it is not
 * declared here; what is declared here is this collection's entry in the plugin's
 * `collections` map in `payload.config.ts`, which `registry.test.ts` diffs against
 * `SCOPE_REGISTRY` in both directions.
 *
 * **Declared elsewhere, on purpose:**
 *   - `descricao_completa` (rich text) — Payload 3 has no editor unless one is installed, and
 *     `@payloadcms/richtext-lexical` is not a dependency. The spec chose Lexical; adding the
 *     package is a stack change (constitution Principle 1), not a field declaration.
 *   - `imagem_capa`, `galeria`, `arquivos` — an `upload` field needs an upload-enabled
 *     collection to point at, and none exists yet (`Organizations.ts:158` already carries the
 *     same deferral for `logo`). The upload subsystem landed in `lib/uploads`; the collection
 *     that uses it has not.
 *   - `autor` → `perfilMaker` (T042), `maquinas_utilizadas` → `estacao`,
 *     `skills_relacionadas` → `skill`, `missao_relacionada` → `missao` (all feature 005,
 *     FR-022). Payload throws at config load for a relationship whose target does not exist,
 *     so these are additive once their targets land — not silent omissions.
 */
export const Projeto: CollectionConfig = {
  slug: 'projeto',
  // No row is ever written to `payload-locked-documents` for this collection, so there is
  // nothing in it for another organization to enumerate (FR-018, CLR-004). That internal
  // collection is not scoped by the multi-tenant plugin and each of its rows names a document
  // by collection and id — an editor opening a projeto would otherwise publish that id
  // platform-wide. `lockDocuments: false` is Payload's supported per-collection switch
  // (`lockDocuments?: { duration } | false`), not a workaround: `checkDocumentLockStatus`
  // reads `lockDocuments !== false` and returns before it touches the database.
  //
  // The cost, priced in CLR-004 rather than discovered: no "someone else is editing this"
  // warning here, so two team members on the shared admin can overwrite each other silently.
  // Worth revisiting if Payload ever exposes access composition on internal collections.
  lockDocuments: false,
  // The approval record of FR-009/SC-004, written by the collection's own `beforeChange` so it
  // runs after field access has already stripped a publish the writer may not make (Payload
  // orders them `beforeValidate fields → beforeValidate collection → beforeChange collection`,
  // `collections/operations/utilities/update.js:17-20`). A maker's refused hop therefore never
  // reaches the hook as `publicado`, and SC-005 cannot leak an approval through SC-004.
  //
  // The decision lives in `lib/content/review.ts` and is proven there; registering it is what
  // makes it happen. `stamp-approval.test.ts` pins the rule, `review.test.ts` pins that a real
  // row carries the stamp — a hook that is written but never registered passes the first and
  // fails the second.
  hooks: {
    beforeChange: [stampApproval],
  },
  labels: {
    singular: 'Projeto',
    plural: 'Projetos',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): without it the admin offers ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'categoria', 'status', 'updatedAt'],
    description: 'Projetos desta organização. Enviados por makers, publicados pela equipe.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('projeto'), downloadEndpoint('projeto', 'arquivos')],
  access: {
    read: scopedAccess(),
    create: scopedAccess(),
    update: scopedAccess(),
    // Deleting is the team's: a maker who could delete could erase the review trail the
    // approval stamp (T028) is supposed to make permanent.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'titulo',
      type: 'text',
      required: true,
      label: 'Título',
      admin: {
        description: 'Exibido em caixa alta no card.',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: 'URL pública: /projetos/{slug}. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'descricaoCurta',
      type: 'textarea',
      required: true,
      // "texto (máx. ~120 caracteres) — 2 linhas no card". Unbounded, the card grid breaks on
      // the first maker who pastes a paragraph, and it breaks in feature 003 rather than here.
      maxLength: 120,
      label: 'Descrição curta',
      admin: {
        description: 'Até 120 caracteres — duas linhas no card.',
      },
    },
    {
      name: 'categoria',
      type: 'relationship',
      relationTo: 'categoriaProjeto',
      required: true,
      label: 'Categoria',
      admin: {
        description: 'Alimenta o chip do card e as abas de /projetos.',
      },
      // Both sides are scoped, so without this a project can point at another lab's
      // vocabulary — and spike S4c measured that the plugin ACCEPTS such a write on its own
      // (a row in A updated to reference a row in B succeeded). The shared validator, never
      // a local reimplementation: FR-007 is a guarantee only while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'descricaoCompleta',
      type: 'richText',
      label: 'Descrição completa',
      admin: {
        description: 'Corpo da página de detalhe do projeto.',
      },
      // Lexical, wired in `payload.config.ts`. Not a stack addition to argue: spec.md
      // § Decisions settles it in writing — Principle 1 asks for justification to *add* to the
      // stack, and choosing the framework's own default adds nothing, whereas a markdown
      // pipeline would add an editor, a renderer and a sanitiser.
    },
    {
      name: 'imagemCapa',
      type: 'relationship',
      relationTo: 'midiaImagem',
      required: true,
      label: 'Imagem de capa',
      admin: {
        description: 'O arquivo enviado para a biblioteca de imagens desta organização.',
      },
      // **A relationship, not a text key** (decision D3 revised, 2026-09-07).
      //
      // D3 first chose a text column holding a storage key, and that was right while the
      // presigned path was still live: a key is mechanism-agnostic. D1 removed that path and
      // T023b gave the product media collections whose uploads are ordinary Payload documents,
      // so a bare key became a foreign key with no constraint — the stringly-typed relation
      // `sameTenant` exists to prevent everywhere else. Now the database knows the file has an
      // owner, deleting a referenced image is refused rather than silently orphaning a card,
      // and the download route reads the media document through THIS relationship instead of
      // needing an anonymous read of the media collection.
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
      name: 'arquivos',
      // Polymorphic: `projetos.md` lets a project attach meshes AND documents
      // (.stl .3mf .obj .gltf .glb alongside .zip .pdf .svg .dxf), and those live in different
      // media collections because each group carries its own cap and allowlist. One field over
      // two targets keeps that split without asking the maker to know about it.
      type: 'relationship',
      relationTo: ['midiaModelo3d', 'midiaDocumento'],
      hasMany: true,
      label: 'Arquivos',
      admin: {
        description: 'Arquivos fabricáveis anexos. O download é aberto e é contado (FR-016).',
      },
      // `normalizeRefs` already handles the `{ relationTo, value }` shape a polymorphic
      // relationship arrives in — it was written for exactly this and is not being stretched.
      validate: sameTenant,
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
      // Same strategy as `curtidas` and the same reason: counting on read is an N+1 across the
      // card grids this design serves. `data-model.md` § Derived values lists both.
    },
    {
      name: 'curtidas',
      type: 'number',
      required: true,
      // Stored rather than counted on read: the card grids this design serves would otherwise
      // pay an N+1 per page (T030 owns the maintenance strategy). Zero, never null — a card
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
        description: 'Fila de revisão: o maker envia, a equipe publica.',
      },
      // Three states rather than Payload's native drafts, which model only two — the middle
      // one *is* the review queue (FR-008), and `versions: { drafts: true }` has nowhere to
      // put "submitted, awaiting the team".
      //
      // The guard lives **here, on the field**, because this is the only layer Payload hands
      // the incoming value to: the collection's `update` is `scopedAccess()` on purpose, and
      // a document-level guard can only answer "may this maker write this project at all",
      // where both answers are wrong — `false` seals the queue the maker is supposed to fill,
      // `true` lets them publish. `canPublishField` refuses one transition, `→ publicado`,
      // and waves the other two through (T008, SC-005).
      //
      // **`create` as well as `update`**, which the plan's sketch elided: Payload evaluates
      // field access per operation, so a POST arriving with `status: 'publicado'` on a brand
      // new document never meets the update guard at all. `canPublishField` reads `data` when
      // there is no `doc` for exactly this path — guarding only updates would leave the
      // shorter one open.
      //
      // No `read` guard: hiding the state from its own author would make the review queue
      // invisible to the maker waiting in it, and FR-010 hides *unpublished rows*, in the
      // public client, rather than this field.
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
      // through the API. Without field access, a maker — who `canPublishField` correctly stops
      // from setting `status: 'publicado'` — could still POST `aprovacaoRegistrada: true` on a
      // `rascunho` and write themselves the approval record. That pair IS the artifact feature
      // 005 reads to credit XP (CLR-001), so the guard on `status` would be fenced around
      // through the field that actually carries the credit. Worse, the hook's "never cleared"
      // rule then preserves the forgery, so the genuine publication is never dated.
      //
      // `false` for every request, including a master's: the value is a *record of a
      // transition*, and the only thing entitled to write it is the code that performs the
      // transition. Collection hooks run after field access and are unaffected.
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
      // **Written by `stampApproval` alone, never by a request** (FR-009, SC-004, SC-005).
      //
      // `admin.readOnly` is admin-UI cosmetics: it greys the input and stops nothing coming
      // through the API. Without field access, a maker — who `canPublishField` correctly stops
      // from setting `status: 'publicado'` — could still POST `aprovacaoRegistrada: true` on a
      // `rascunho` and write themselves the approval record. That pair IS the artifact feature
      // 005 reads to credit XP (CLR-001), so the guard on `status` would be fenced around
      // through the field that actually carries the credit. Worse, the hook's "never cleared"
      // rule then preserves the forgery, so the genuine publication is never dated.
      //
      // `false` for every request, including a master's: the value is a *record of a
      // transition*, and the only thing entitled to write it is the code that performs the
      // transition. Collection hooks run after field access and are unaffected.
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
      // Optional although `projetos.md` marks it obrigatório: a `rascunho` has no publication
      // date to carry, and requiring one would make the queue's first state unwritable. It is
      // set when the team publishes (T027/T028), which is the only moment it has a value.
      label: 'Data de publicação',
      admin: {
        description: 'Preenchida na publicação. Ordena a listagem (mais recentes primeiro).',
      },
    },
    {
      name: 'destaque',
      type: 'checkbox',
      defaultValue: false,
      label: 'Destaque',
      admin: {
        description: 'Replica o projeto na Home.',
      },
    },
    {
      name: 'materiais',
      type: 'text',
      hasMany: true,
      label: 'Materiais',
      admin: {
        description: 'Ex.: MDF 6mm, PLA.',
      },
    },
  ],
}
