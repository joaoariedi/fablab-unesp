import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  CollectionSlug,
} from 'payload'

import { creditXp, perfilDoUsuarioNesta } from '../../lib/content/xp'
import { TenantUnresolvedError } from '../../lib/tenancy'
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

/** A relationship value as a hook receives it: an id at `depth: 0`, the document above it. */
const idDaRelacao = (ref: unknown): string | number | null => {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object') {
    const { id } = ref as { id?: unknown }
    return typeof id === 'string' || typeof id === 'number' ? id : null
  }
  return typeof ref === 'string' || typeof ref === 'number' ? ref : null
}

/** The slice of a progress row the credit reads, at `depth: 0` or populated. */
type Progresso = { id?: unknown; usuario?: unknown; aula?: unknown; concluidaEm?: unknown }

/**
 * **The class completion credit** (T023, FR-025, SC-011, US2): one ledger entry the first time
 * `concluidaEm` is stamped, written inside the completing write's own transaction.
 *
 * **It fires on the TRANSITION, never on the state.** `concluidaEm` stays set forever once the
 * class is finished, and the row keeps being written afterwards — `posicaoReproducao` moves on
 * every rewatch and `percentualAssistido` is rewritten — so a hook that asked only *"is this
 * row complete?"* would call `creditXp` on every one of those writes. It would not
 * double-credit: `xpLedger`'s unique index is the arbiter (FR-003) and `creditXp` reads the
 * ledger before inserting, so the second call returns `false`. But it would spend a ledger
 * query and an economy read inside every player heartbeat, and it would make
 * *"however many times it is rewatched"* a property of somebody else's index rather than of
 * this hook. `previousDoc?.concluidaEm` is what makes rewatching cost nothing at all.
 *
 * `afterChange`, for `creditOnApproval`'s reason one file over: it is verified to run inside
 * the operation's transaction in Payload 3.88, which is what FR-004 requires of the entry, and
 * it sees the stamp already written rather than racing the hook that writes it.
 *
 * The profile is resolved from the **row's own `usuario`**, not from `req.user`: the credit
 * belongs to whoever watched, and `attributeProgressToRequester` above is what makes those the
 * same account for a real request while leaving seeds and migrations writing honest history.
 * `progressoAula.usuario` is global and XP is per profile per organization, so the bridge is
 * explicit (plan § D3).
 *
 * **What this hook does NOT check, on purpose: the completion claim is trusted** (CLR-008,
 * FR-038). Nothing here verifies that the class was watched — there is no elapsed-time floor
 * against `aula.duracaoMin`, and there are no server-side checkpoints — so a stamped
 * `concluidaEm` credits whatever the client claimed. Both alternatives were costed and declined:
 * the floor is cheap and beaten by waiting, checkpoints are strong and change this collection's
 * whole write path.
 *
 * It is defensible because of what BOUNDS the claim, not because the claim is believed. FR-027
 * still requires a progress row belonging to the requesting maker, and idempotency — `creditXp`'s
 * key, FR-003 — caps the gain at **1 XP per class, forever**: someone who claims the entire
 * catalogue in four minutes ends up with exactly the XP that watching it honestly pays. Every
 * credit is an xpLedger row naming who, what and when, and that ledger is append-only, so the
 * claim is visible after the fact by inspection, with no instrumentation built first.
 *
 * **It does not claim farming is prevented.** It is not — bounded and auditable is a weaker and
 * different property, deliberately chosen (the honest-community posture of 2026-08-24, *"sem
 * limite diário no v1"*). So a check added here is a REOPENING of CLR-008, not the repair of an
 * oversight; the decision is revisitable once the game is running, and this comment is where the
 * next reader finds that out instead of rediscovering the gap.
 */
export const creditarConclusao: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const linha = doc as Progresso
  if (!linha.concluidaEm) return doc
  // Already credited: the stamp was carried in by the write before this one. A create has no
  // earlier row at all, and `previousDoc` is then whatever Payload passes for "nothing" — so
  // the test is on the stamp's presence, not on the existence of a previous document.
  if ((previousDoc as Progresso | undefined)?.concluidaEm) return doc

  const aula = idDaRelacao(linha.aula)
  const refId = Number(aula)
  if (!Number.isInteger(refId)) {
    // The id is half of the idempotency key. A non-numeric one composes a key that matches
    // nothing, so the same class would credit again on every completion — louder here than in
    // a ledger nobody can reconcile.
    throw new Error(
      `progressoAula ${String(linha.id)} names a non-numeric aula (${JSON.stringify(aula)}), so ` +
        'no xpLedger entry can name it; xpLedger.refId is an integer and half of the key',
    )
  }

  try {
    const perfil = await perfilDoUsuarioNesta(req, linha.usuario as never)
    if (!perfil) {
      // **No profile in this organization is a real state, and it is decided here rather than
      // crashed on** (T024, US2, plan § D3). `usuario` is global and `perfilMaker` is scoped,
      // so somebody may genuinely watch a class at a lab they never joined — and this hook
      // runs inside the watching write's own transaction, so throwing would roll back a
      // progress row that was entirely correct. Punishing the watch for the profile's absence
      // is the harsher of the two failures.
      //
      // It warns rather than returning silently for `creditOnApproval`'s measured reason
      // (`Projeto.ts`, missing author): a credit that never happened and a credit that worked
      // are indistinguishable from the outside, so the one line is the only thing that makes
      // an unjoined watcher — or a broken profile catalogue — findable at all. Once per
      // completion and not once per rewatch: the transition guard above has already returned
      // for every later write of this row.
      console.warn(
        `[xp] usuário ${String(idDaRelacao(linha.usuario))} concluiu a aula ${String(refId)} ` +
          'mas não tem perfilMaker nesta organização; nada creditado',
      )
      return doc
    }

    // Awaited, and its rejection deliberately uncaught — that is what keeps the entry inside
    // the completing write's transaction rather than beside it (FR-004). The one named
    // exception below is `creditOnApproval`'s, for the same measured reason.
    await creditXp({ req, perfil: perfil.id, acao: 'assistir_aula', refTipo: 'aula', refId })
  } catch (erro) {
    // **A write with no host is a SERVER-SIDE write** — a seed, a migration, the tenancy
    // fixtures, which seed this very collection through the Local API with no host at all.
    // The choke point quite correctly refuses to guess an organization there, and letting that
    // refusal out of an `afterChange` hook would roll back a progress row nobody did anything
    // wrong to write (measured on `creditOnApproval`, `Projeto.ts`). Anything else propagates.
    if (!(erro instanceof TenantUnresolvedError)) throw erro
    console.warn(
      `[xp] aula ${String(refId)} concluída sem host na requisição (escrita de servidor); ` +
        'nada creditado',
    )
  }

  return doc
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
    // The 1-XP-per-aula credit, on the write that stamps `concluidaEm` and on no other.
    afterChange: [creditarConclusao],
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
      access: {
        /**
         * **Immutable once written, and this is FR-027 on the update verb.**
         *
         * `attributeProgressToRequester` is `create`-only, and `access.update` on the
         * collection is `scopedAccess()` — a **lab-wide** constraint, not a row-owned one — so
         * a signed-in maker may PATCH a lab-mate's progress row. With this field writable, they
         * could name themselves in that PATCH and stamp `concluidaEm`, and `creditarConclusao`
         * resolves the credit from the row's own `usuario`: the XP would land on an account
         * that holds no progress row for the class at all. The unique `(usuario, aula)` pair
         * cannot object, because the premise of the attack is that the pair is still free.
         *
         * Measured through the real collection before it was closed, not read off the source:
         * `tests/content/xp-aula-integracao.test.ts` § 2 drove the PATCH with
         * `overrideAccess: false` and watched `usuario` change hands.
         *
         * The refusal is **silent** — Payload drops a field the requester may not write rather
         * than rejecting the operation — which is the behaviour wanted here: the rest of that
         * PATCH (the percentage, the resume point) is an ordinary lab-wide write, and failing
         * it outright would turn the narrowing into an outage for the player.
         *
         * It does not close the lab-vs-row gap this collection documents above; it closes the
         * half where that gap becomes XP. A lab-mate can still mark somebody else's row
         * complete — the credit then goes to whoever the row belongs to, capped at the 1 XP
         * they would have earned by watching, and named in an append-only ledger row.
         */
        update: () => false,
      },
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
