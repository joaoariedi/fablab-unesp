import type { CollectionConfig, CollectionSlug } from 'payload'

import { stampApproval } from '../../lib/content/review'
import { canPublishField, scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A relation target whose collection **exists but is not registered yet**.
 *
 * `relationTo` is typed against `CollectionSlug`, which Payload derives from the *generated*
 * `payload-types.ts` — and generation follows registration, which is T044's single edit. So
 * `local`, `maquina`, `aula` and `perfilMaker` are absent from that union on a developer
 * machine carrying a generated file from before this phase; in CI the file does not exist at
 * all, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot smuggle a *wrong* slug past anything that matters:
 * Payload resolves `relationTo` at config load and throws `InvalidFieldRelationship` for a
 * target that is genuinely missing, which is the check this defers to rather than replaces.
 * Delete it once the twelve are registered and the types are regenerated. `Aula.ts` and
 * `Artigo.ts` carry the same helper for the same reason; the three merge into one when that
 * deletion happens.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

/**
 * An activity on **one** lab's agenda (FR-001, FR-003, FR-021, T041) — the calendar of
 * `calendario.md`, and the last of the five content collections FR-001 names.
 *
 * It lands after `local` and `maquina` because it relates to both, and a relationship whose
 * target does not exist throws `InvalidFieldRelationship` at config load rather than degrading.
 *
 * Every field traces to `calendario.md` § Modelo de conteúdo. Four depart from that table, and
 * each time a later decision overrules the page:
 *
 *   - **`status` is `rascunho · publicado · cancelado · concluido`**, not the three-state
 *     review queue the other four content collections carry. `data-model.md` § Review queue
 *     says so in writing — an agenda entry is cancelled or finished, never "awaiting review".
 *     The labels the page shows (`INSCRIÇÕES ABERTAS` · `LOTADO` · `ENCERRADO`) are *derived*
 *     from `prazoInscricao`, `vagasTotal` and `fimEm` by feature 003; only `CANCELADO` comes
 *     from this field, which is why they are not options here.
 *   - **`responsavel` points at `perfilMaker`, not `usuario`.** `calendario.md` predates
 *     CLR-002, which split identity from profile: level and XP are per-organization, so the
 *     card's `NÍVEL n` is a profile fact and one person running events at two labs has one
 *     login and two profiles. `data-model.md` lists `evento.responsavel` among the
 *     relationships needing `sameTenant`, which is only meaningful against a scoped target.
 *   - **`xp_presenca` stays in the model and is unused** (FR-023, PO 2026-08-24): "o
 *     calendário não concede XP; campo fica no modelo, sem uso na UI do v1". Keeping it means
 *     the check-in's return is a decision rather than a migration.
 *   - **`capa`, `materiais` and `galeria_pos_evento` are relationships to the media
 *     collections**, not text keys — D3 as revised 2026-09-07, the same shape `Aula.ts` uses:
 *     each group's cap and allowlist live on its collection, so a file inherits them by
 *     construction, and the database refuses to delete an image a published event still shows.
 *
 * **`read: scopedAccess()` is the admin and REST surface only.** The agenda is public (PO,
 * 2026-08-24), and a public visitor never reaches this function: they are served by
 * `getPublicScopedPayload`, which goes *around* collection access, because the multi-tenant
 * plugin AND-s its own `{ tenant: { in: userTenantIDs } }` onto whatever we return and would
 * nullify a public branch (plan § Sketch 2). So an anonymous read here is a flat refusal, not
 * a published-only filter — and `derivePublishable` picks this collection up from its `status`
 * field, so the agenda works without an allowlist anyone has to remember to extend.
 *
 * `create` and `update` are `scopedAccess()` rather than `teamOnly()`: `calendario.md`'s open
 * question 6 ("quem cria eventos — apenas a equipe, ou makers podem propor atividades?") is
 * **not closed**, and the template's answer costs nothing either way, because the guard that
 * decides what reaches the public agenda is one level down, on the `status` field. A
 * collection-level write guard cannot distinguish "propose an activity" from "announce it".
 *
 * **No download endpoint, deliberately.** `serveDownload` reads a document's **`arquivos`**
 * (`lib/content/downloads.ts` § DocumentWithFiles), and this collection's files are
 * `materiais` per `calendario.md`, so registering `downloadEndpoint('evento')` here would
 * answer 404 to every request — a route that looks like FR-015 holding and is not. FR-015
 * names "projects, articles and classes"; the agenda's open access is the listing, the detail
 * page and the `.ics`. When `serveDownload` learns which field to read, this collection joins
 * with one line and a `downloads` counter beside it.
 *
 * **Declared elsewhere, on purpose:**
 *   - **`skill`** and **`missao_relacionada`**, whose targets belong to feature 005 (FR-022 as
 *     amended by D2 — a `relationTo` cannot name a collection that does not exist).
 *   - **`inscricao` and `presenca`**, the two related collections `calendario.md` lists: the
 *     second is reserved out of v1 by the same PO decision as `xp_presenca`, and the first is
 *     the enrolment flow, which no requirement in this feature's spec asks for. `evento`
 *     carries the fields those flows read (`vagasTotal`, `inscricaoObrigatoria`,
 *     `prazoInscricao`) so neither needs a reshape here.
 *   - **`dataPublicacao`**, which the other four content collections carry. `calendario.md`
 *     lists no publication date, and the agenda is ordered by `inicioEm` — a second date
 *     nothing sorts by is a field that drifts unnoticed.
 *
 * Registration — the config list, the plugin's `collections` map and `SCOPE_REGISTRY` — is
 * T044's single edit: `registry.test.ts` diffs the two in both directions and fails the build
 * whenever they disagree.
 */
export const Evento: CollectionConfig = {
  slug: 'evento',
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
  //
  // It fires on the transition into `publicado` and on no other, so `cancelado` and
  // `concluido` — the two states this collection has and the others do not — leave the stamp
  // exactly as they found it, which is what CLR-001 requires of a record feature 005 reads.
  hooks: {
    beforeChange: [stampApproval],
  },
  labels: {
    singular: 'Evento',
    plural: 'Eventos',
  },
  admin: {
    // Also what a relationship picker renders (FR-021): without it the admin offers ids.
    useAsTitle: 'titulo',
    defaultColumns: ['titulo', 'tipo', 'inicioEm', 'local', 'status'],
    description: 'Agenda desta organização: oficinas, aulas presenciais, mutirões e manutenções.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('evento')],
  access: {
    read: scopedAccess(),
    create: scopedAccess(),
    update: scopedAccess(),
    // Deleting is the team's: a maker who could delete could strike an announced activity off
    // the agenda, and with it the review trail the approval stamp makes permanent.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'titulo',
      type: 'text',
      required: true,
      label: 'Título',
      admin: {
        description: 'Exibido em caixa alta no card (OFICINA DE CORTE A LASER).',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      label: 'Slug',
      admin: {
        description: 'URL pública: /calendario/{slug}. Sem acentos e sem espaços.',
      },
    },
    {
      name: 'tipo',
      type: 'select',
      required: true,
      label: 'Tipo',
      options: [
        { label: 'Oficina', value: 'oficina' },
        { label: 'Aula presencial', value: 'aula_presencial' },
        { label: 'Mutirão', value: 'mutirao' },
        { label: 'Manutenção', value: 'manutencao' },
        { label: 'Evento aberto', value: 'evento_aberto' },
        { label: 'Prazo de missão', value: 'prazo_missao' },
      ],
      admin: {
        description: 'Define a cor do chip e alimenta os filtros multisseleção da agenda.',
      },
      // A vocabulary rather than free text: the filter chips are a fixed, coloured set, and a
      // typo in a text field would create a seventh type nobody can filter by. Open question 4
      // of `calendario.md` asks whether the six are the right ones — adding a seventh is one
      // line here, which is the point of keeping them in one place.
    },
    {
      name: 'descricaoCurta',
      type: 'textarea',
      required: true,
      // "texto (≤140 car.) — 2 linhas no card". Unbounded, the agenda list breaks on the first
      // author who pastes a paragraph, and it breaks in feature 003 rather than here.
      maxLength: 140,
      label: 'Descrição curta',
      admin: {
        description: 'Até 140 caracteres — duas linhas no card.',
      },
    },
    {
      name: 'descricaoLonga',
      type: 'richText',
      label: 'Descrição longa',
      admin: {
        description: 'Corpo da página de detalhe do evento.',
      },
      // Lexical, wired in `payload.config.ts`. spec.md § Decisions settles this in writing:
      // Principle 1 asks for justification to *add* to the stack, and choosing the framework's
      // own default adds nothing, whereas markdown would add an editor, a renderer and a
      // sanitiser.
    },
    {
      name: 'oQueVaiFazer',
      type: 'richText',
      label: 'O que você vai fazer',
      admin: {
        description: 'Bloco O QUE VOCÊ VAI FAZER na página de detalhe.',
      },
    },
    {
      name: 'oQueLevar',
      type: 'richText',
      label: 'O que levar',
      admin: {
        description: 'Bloco O QUE LEVAR na página de detalhe.',
      },
      // Rich text rather than an `array` of strings, for both blocks: `calendario.md` marks
      // them "rich text / lista", and a list is expressible in rich text while the reverse is
      // not — the page also shows prose in these blocks.
    },
    {
      name: 'capa',
      type: 'relationship',
      relationTo: 'midiaImagem',
      label: 'Capa',
      admin: {
        description: 'Imagem 16:9 do detalhe do evento. Enviada para a biblioteca de imagens desta organização.',
      },
      // A relationship, not a text key (D3 as revised 2026-09-07): the media collection is
      // where the image group's cap and allowlist live, so the cover inherits the image rules
      // by construction, and deleting a referenced image is refused rather than silently
      // blanking a card.
      validate: sameTenant,
    },
    {
      name: 'inicioEm',
      type: 'date',
      required: true,
      label: 'Início',
      admin: {
        description: 'Data e hora de início, no fuso America/São Paulo. Ordena a agenda.',
      },
      // The agenda's sort key, which is why this collection carries no `dataPublicacao`: a
      // calendar is ordered by when the activity happens, not by when it was announced.
      index: true,
    },
    {
      name: 'fimEm',
      type: 'date',
      required: true,
      label: 'Fim',
      admin: {
        description: 'Data e hora de término. A duração exibida (3 h) e o rótulo ENCERRADO derivam daqui.',
      },
    },
    {
      name: 'diaInteiro',
      type: 'checkbox',
      defaultValue: false,
      label: 'Dia inteiro',
      admin: {
        description: 'Oculta o horário no card e no detalhe.',
      },
    },
    {
      name: 'recorrencia',
      type: 'text',
      label: 'Recorrência',
      admin: {
        description: 'Regra RRULE (RFC 5545) para eventos semanais ou mensais. Vazio significa evento único.',
      },
      // Text carrying an RRULE, as the page specifies. Not modelled as fields (weekly, until,
      // byday…) because the `.ics` feed the page promises consumes exactly this string, and a
      // second representation is a second thing to keep in agreement with it.
    },
    {
      name: 'local',
      type: 'relationship',
      relationTo: pendingSlug('local'),
      required: true,
      label: 'Local',
      admin: {
        description: 'Sala ou estação do lab. Exibido no metadado 📍 do card.',
      },
      // Scoped → scoped, so the same-tenant rule applies: a room belongs to the lab it is in.
      // The shared validator, never a local reimplementation — FR-007 is a guarantee only
      // while there is one of it, and spike S4c measured the plugin ACCEPTING a cross-tenant
      // write on its own.
      validate: sameTenant,
    },
    {
      name: 'maquinas',
      type: 'relationship',
      relationTo: pendingSlug('maquina'),
      hasMany: true,
      label: 'Máquinas',
      admin: {
        description: 'Máquinas envolvidas. Exibidas no metadado 🖨 e usadas pelo filtro da agenda.',
      },
      validate: sameTenant,
    },
    {
      name: 'responsavel',
      type: 'relationship',
      relationTo: pendingSlug('perfilMaker'),
      required: true,
      label: 'Responsável',
      admin: {
        description: 'Perfil exibido no metadado 👤 do card: nome, @handle e nível.',
      },
      // `perfilMaker`, not `usuario` (CLR-002) — see the docstring. Scoped → scoped, so the
      // shared validator applies.
      validate: sameTenant,
    },
    {
      name: 'aulasPrerequisito',
      type: 'relationship',
      relationTo: pendingSlug('aula'),
      hasMany: true,
      label: 'Aulas pré-requisito',
      admin: {
        description: 'Bloco PRÉ-REQUISITOS do detalhe. Aulas que convém assistir antes.',
      },
      validate: sameTenant,
    },
    {
      name: 'vagasTotal',
      type: 'number',
      min: 0,
      label: 'Vagas',
      admin: {
        description: 'Vazio significa sem limite. Alimenta 12/20 vagas e o rótulo LOTADO.',
      },
    },
    {
      name: 'inscricaoObrigatoria',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      label: 'Inscrição obrigatória',
      admin: {
        description: 'Controla o botão INSCREVER-SE. Questão 2 de calendario.md segue aberta.',
      },
      // `required: true`, as `calendario.md` marks it, and it does NOT mean "must be ticked".
      //
      // The first version dropped requiredness on the reasoning that "Payload's checkbox
      // validation rejects a falsy value when `required` is set, so a required checkbox is a
      // checkbox that must be ticked". That is false, and it was measured rather than argued:
      // `validations.checkbox(false, { required: true })` returns `true` (accepted), while
      // `validations.checkbox(undefined, { required: true })` returns `validation:trueOrFalse`.
      // On a checkbox `required` means "must carry a boolean", which is exactly the guarantee
      // the page spec is asking for and what the default already provides — so declaring it
      // costs nothing and stops the field reading as an optional one to the next reader.
    },
    {
      name: 'prazoInscricao',
      type: 'date',
      label: 'Prazo de inscrição',
      admin: {
        description: 'Depois desta data o botão vira ENCERRADO. Vazio significa até o início.',
      },
    },
    {
      name: 'xpPresenca',
      type: 'number',
      min: 0,
      label: 'XP de presença',
      admin: {
        description: 'Reservado — fora do escopo v1 (PO, 2026-08-24). O calendário não concede XP.',
      },
      // **Reserved and unused** (FR-023). The check-in is out of v1, so nothing reads or
      // writes this in the product; the field exists so its return is a decision rather than a
      // migration. It is deliberately NOT required — nothing fills it in v1.
    },
    {
      name: 'materiais',
      // Polymorphic: `calendario.md` lists ".pdf .zip .stl .3mf .obj .gltf .glb .svg .dxf",
      // which spans meshes AND documents, and those live in different media collections
      // because each group carries its own cap and allowlist. One field over two targets keeps
      // that split without asking the author to know about it.
      type: 'relationship',
      relationTo: ['midiaModelo3d', 'midiaDocumento'],
      hasMany: true,
      label: 'Materiais',
      admin: {
        description: 'Bloco MATERIAIS DE APOIO do rodapé do detalhe.',
      },
      // `normalizeRefs` already handles the `{ relationTo, value }` shape a polymorphic
      // relationship arrives in — it was written for exactly this.
      validate: sameTenant,
    },
    {
      name: 'galeriaPosEvento',
      type: 'relationship',
      relationTo: 'midiaImagem',
      hasMany: true,
      label: 'Galeria pós-evento',
      admin: {
        description: 'Bloco REGISTRO DA ATIVIDADE: fotos publicadas depois do evento (.jpg, .png, .webp).',
      },
      validate: sameTenant,
    },
    {
      name: 'projetosGerados',
      type: 'relationship',
      relationTo: 'projeto',
      hasMany: true,
      label: 'Projetos gerados',
      admin: {
        description: 'Projetos que saíram desta atividade. Também no bloco REGISTRO DA ATIVIDADE.',
      },
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
        { label: 'Publicado', value: 'publicado' },
        { label: 'Cancelado', value: 'cancelado' },
        { label: 'Concluído', value: 'concluido' },
      ],
      admin: {
        description:
          'Rascunho é o único status invisível na agenda pública: publicado, cancelado e ' +
          'concluído aparecem, porque um evento que já foi público não deve sumir — quem o viu ' +
          'ontem concluiria que ele continua de pé. INSCRIÇÕES ABERTAS, LOTADO e ENCERRADO são ' +
          'derivados do prazo, das vagas e do fim — não deste campo.',
      },
      // **Four states, not the three-state review queue.** `data-model.md` § Review queue
      // gives this collection its own set per `calendario.md`; `em_revisao` has no meaning for
      // an agenda entry, and `cancelado`/`concluido` have none for an article.
      //
      // The guard lives **here, on the field**, because this is the only layer Payload hands
      // the incoming value to: the collection's `update` is `scopedAccess()` on purpose, and a
      // document-level guard can only answer "may this maker write this evento at all", where
      // both answers are wrong — `false` seals the draft the proposer is supposed to fill,
      // `true` lets them announce it, or cancel someone else's.
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
      name: 'publicoAlvo',
      type: 'select',
      label: 'Público-alvo',
      options: [
        { label: 'Aberto ao público', value: 'aberto' },
        { label: 'Somente makers', value: 'makers' },
        { label: 'Equipe', value: 'equipe' },
      ],
      admin: {
        description: 'Quem a atividade atende. Exibido no detalhe; não substitui o controle de acesso.',
      },
      // Editorial, never a permission: the agenda is public by decision (PO, 2026-08-24), and
      // what a visitor may read is decided by `status` and by `getPublicScopedPayload`. Reading
      // this field as access control would be a rule enforced in the renderer, where feature
      // 003 could forget it.
    },
    {
      name: 'curtidas',
      type: 'number',
      required: true,
      // Stored rather than counted on read: the agenda grids this design serves would otherwise
      // pay an N+1 per page. Zero, never null — a card rendering `null ♥` is the bug a nullable
      // counter always eventually produces.
      defaultValue: 0,
      min: 0,
      label: 'Curtidas',
      admin: {
        readOnly: true,
        description: 'Interesse no evento. Derivado das curtidas, mantido pelo sistema.',
      },
      // `curtida.conteudo` gains `evento` as a target when both are registered (T043 declares
      // it over `projeto` first); this is the counter the card renders, maintained in the same
      // transaction as the like (`data-model.md` § Derived values).
    },
    {
      name: 'aprovacaoRegistrada',
      type: 'checkbox',
      defaultValue: false,
      label: 'Aprovação registrada',
      // **Written by `stampApproval` alone, never by a request** (FR-009, SC-004, SC-005).
      //
      // `admin.readOnly` is admin-UI cosmetics: it greys the input and stops nothing coming
      // through the API. Without field access, a proposer — whom `canPublishField` correctly
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
        description: 'Marcado na primeira publicação. Nunca desmarcado — nem ao cancelar.',
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
        description: 'Data da primeira publicação. Republicar depois de um cancelamento não a reescreve.',
      },
    },
  ],
}
