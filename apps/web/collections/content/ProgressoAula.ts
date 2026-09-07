import type { CollectionBeforeValidateHook, CollectionConfig, CollectionSlug } from 'payload'

import { scopedAccess, teamOnly } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A relation target whose collection **exists but is not registered yet** — `aula`, declared
 * beside this file by the same task. `relationTo` is typed against `CollectionSlug`, which
 * Payload derives from the *generated* `payload-types.ts`, and generation follows
 * registration (T044's single edit); today that file lists neither `aula` nor `perfilMaker`.
 * In CI it does not exist at all, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot smuggle a *wrong* slug past anything that matters:
 * Payload throws `InvalidFieldRelationship` at config load for a target that is genuinely
 * missing. `Aula.ts` and `Artigo.ts` carry the same helper for the same reason; all three go
 * when the twelve are registered and the types are regenerated.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

/**
 * **The progress row is attributed to the requester, never to the account the payload names.**
 *
 * `create: scopedAccess()` already refuses a request with no session, which is the first gate
 * of "a coleção só existe para usuário logado" (PO, 2026-08-24). This closes the second: with
 * `usuario` writable from the body, a signed-in maker could manufacture watch records for
 * anybody — and once feature 005 credits XP off these rows (1 XP per aula, CLR-001), that is
 * an XP grant with somebody else's name on it.
 *
 * **Why it stamps rather than refuses when there is no user.** Fixtures, seeds and migrations
 * write through the Local API with `overrideAccess: true` and no session at all — the
 * isolation harness seeds every scoped collection that way (`tests/tenancy/fixtures.ts`), so
 * a hook that threw here would make `progressoAula` unseedable and take the harness down with
 * it. The anonymous *request* never reaches this hook: access control refuses it one layer up,
 * and that is the layer which actually sees requests. Trusted server code keeps the
 * attribution it supplies.
 *
 * **Create only.** An update carries the percentage and the resume point, not a change of
 * viewer; re-stamping it with whoever happened to be signed in would rewrite history rather
 * than record it — and the unique `(usuario, aula)` pair below means such a rewrite could
 * silently collide with that person's real row.
 *
 * Deliberately a second implementation rather than `curtida`'s `attributeLikeToRequester`
 * imported: the two are the same three lines today and diverge the moment either grows a
 * rule of its own (this one is already the only one whose row feeds an XP ledger). If a third
 * collection needs it, that is the signal to lift one shared hook into `lib/content/`.
 */
export const attributeProgressToRequester: CollectionBeforeValidateHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  const userId = (req?.user as { id?: string | number } | undefined)?.id
  if (userId === undefined || userId === null) return data

  return { ...data, usuario: userId }
}

/**
 * How far one account got through one class — **`usuario` × `aula`** (FR-003, T040).
 *
 * **A coleção só existe para usuário logado** (PO, 2026-08-24, `aulas.md` § Coleções
 * relacionadas): a visitor watches the video — that is open — but generates no row and earns
 * no XP. Anonymous audience counting, the analogue of the anonymous downloads FR-015 counts,
 * is still **(proposta)** and is deliberately not smuggled in here.
 *
 * Three properties have to hold before feature 005 can credit XP off these rows, and no one
 * of them is sufficient alone:
 *
 *   1. `create: scopedAccess()` refuses a request carrying no `req.user` — the door itself;
 *   2. `usuario` is **required**, so no row can exist that names no account, whatever path
 *      wrote it; and
 *   3. `attributeProgressToRequester` binds that account to the requester, so "watched by an
 *      account" cannot be satisfied by naming somebody else's.
 *
 * **One row per person per class**, as a unique compound index. "Crédito uma vez por aula
 * (anti-farm)" (2026-08-23) is only enforceable while a second row cannot exist. `curtida`
 * had to defer the equivalent because `conteudo` is polymorphic — Postgres stores it in the
 * relationships join table, and there is no column pair to constrain; here both sides are
 * single-target relationships, so `indexes` (payload 3.88 `CompoundIndex`) expresses it
 * directly and T047's migration carries it to the database.
 *
 * **`concluidaEm` is filled at 100%**, not at 90% and not by a button: round 5 (2026-08-24)
 * supersedes both proposals in writing. `posicaoReproducao` keeps serving the *resume*, which
 * is a different question from completion — the mockup's `12:45` on the thumb.
 *
 * **Known gap, priced rather than discovered:** `scopedAccess` scopes to the *lab*, not to the
 * row, so a member of lab A can read and edit another member of lab A's progress. Narrowing
 * it needs an "own row" constraint joining `usuario` to `req.user.id`; `perfilMaker` and
 * `curtida` carry the same gap for the same reason, and all three close with the feature that
 * puts these rows under a user's own UI.
 *
 * The `tenant` field is injected by the multi-tenant plugin, so it is not declared here. This
 * collection's entry in the plugin's `collections` map and in `SCOPE_REGISTRY` lands with
 * T044: `registry.test.ts` diffs the two in both directions, so they cannot land separately.
 */
export const ProgressoAula: CollectionConfig = {
  slug: 'progressoAula',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Same
  // switch, same reason, as the `projeto` template.
  lockDocuments: false,
  // Anti-farm, at the database rather than in a hook that a second writer could bypass: the
  // "watched once" record feature 005 credits from is only once while the pair is unique.
  indexes: [{ fields: ['usuario', 'aula'], unique: true }],
  hooks: {
    beforeValidate: [attributeProgressToRequester],
  },
  labels: {
    singular: 'Progresso de aula',
    plural: 'Progressos de aula',
  },
  admin: {
    // No text field to title a row with: progress *is* the pair plus a percentage, so the
    // admin lists that rather than inventing a label for it.
    defaultColumns: ['usuario', 'aula', 'percentualAssistido', 'concluidaEm'],
    description: 'Progresso das aulas desta organização. Só existe para usuário logado.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-021, SC-002). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('progressoAula')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then
    // leaks every row — here, who watched what in the other lab.
    read: scopedAccess(),
    // The door of "só para usuário logado": `scopedAccess` opens `if (!user) return false`, so
    // an anonymous POST is refused before any field is considered. The refusal is the product
    // behaviour the page spec describes, not an omission — the visitor still watches.
    create: scopedAccess(),
    // Watching advances the percentage and the resume point many times per session, so update
    // is the maker's own and not the team's.
    update: scopedAccess(),
    // **Deleting is the team's, and this is the anti-farm half.** The row IS the "watched
    // once" record; a maker who could delete theirs could re-watch and be credited a second
    // time, defeating the 1-XP-per-aula economy through the one verb the unique index cannot
    // see. `teamOnly()` leaves a correction path for a genuinely wrong row without opening it
    // to the person the credit belongs to.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      // Every read of this collection asks "how far did this account get?", so the account
      // side is the one queried — Cursos assistidos in Minha Conta is exactly that query.
      index: true,
      label: 'Usuário',
      admin: {
        description: 'A conta que assistiu. Preenchida pelo sistema a partir da sessão.',
      },
      // **No `sameTenant`, and its absence is the design.** `users` is global — it has no
      // `tenant` to compare against — and data-model.md § "Relationships that need sameTenant"
      // names the global side as the exception for exactly that reason (`perfilMaker.usuario`
      // and `curtida.usuario` carry the same note). The scoped half is `aula`, below.
    },
    {
      name: 'aula',
      type: 'relationship',
      relationTo: pendingSlug('aula'),
      required: true,
      index: true,
      label: 'Aula',
      admin: {
        description: 'A aula assistida. Uma linha por pessoa e por aula.',
      },
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a row in A updated
      // to reference a row in B. Without the shared validator, progress crosses organizations
      // and credits XP against another lab's class. The shared one, never a local
      // reimplementation: FR-007 is a guarantee only while there is one of it.
      validate: sameTenant,
    },
    {
      name: 'percentualAssistido',
      type: 'number',
      required: true,
      // Zero, never null — the progress bar in Cursos assistidos renders this directly, and
      // `null% concluído` is the bug a nullable counter always eventually produces.
      defaultValue: 0,
      min: 0,
      // 100 is the completion threshold round 5 decided, so a value above it is not merely
      // odd — it is a row claiming more than the transition `concluidaEm` records.
      max: 100,
      label: 'Percentual assistido',
      admin: {
        description: 'De 0 a 100. Alimenta a barra "n% concluído" da Minha Conta.',
      },
    },
    {
      name: 'concluidaEm',
      type: 'date',
      // Optional on purpose: an in-progress row has no completion date, and requiring one
      // would make the collection's normal state unwritable — the same reasoning
      // `dataPublicacao` records on the content collections.
      label: 'Concluída em',
      admin: {
        description: 'Preenchida ao assistir o vídeo inteiro (100%) — decisão de 2026-08-24.',
      },
    },
    {
      name: 'posicaoReproducao',
      type: 'number',
      min: 0,
      label: 'Posição de reprodução',
      admin: {
        description: 'Em segundos. É de onde o player retoma; a Minha Conta exibe como mm:ss.',
      },
      // **Seconds, not the `mm:ss` the mockup shows.** `minha-conta.md` renders `12:45`, which
      // is a *formatting* of a position — storing the formatted string would make "resume at
      // 12:45" a parse on every read and would not survive a video over an hour long. The page
      // spec marks the fine modelling **(proposta)**, so this is the choice, recorded: the
      // player seeks to a number.
    },
  ],
}
