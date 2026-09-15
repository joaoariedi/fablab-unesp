import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
  CollectionSlug,
  FieldAccess,
  PayloadRequest,
} from 'payload'

import { creditXp, perfilDoUsuarioNesta } from '../../lib/content/xp'
import { getTenantScopedPayload, TenantUnresolvedError } from '../../lib/tenancy'
import { scopedAccess, teamOnly, tenantIdsOf } from '../../lib/tenancy/access'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { scopedListEndpoint } from '../../lib/tenancy/scoped-endpoint'

/**
 * A relation target whose collection **exists but is not registered yet** — `missao`, declared
 * beside this file by T026. `relationTo` is typed against `CollectionSlug`, which Payload
 * derives from the *generated* `payload-types.ts`, and generation follows registration (T028);
 * today that file lists neither `missao` nor `missaoSubmissao`. In CI the generated file does
 * not exist at all, the union widens to `string`, and this call is a no-op.
 *
 * It narrows a `string`, so it cannot smuggle a *wrong* slug past anything that matters:
 * Payload throws `InvalidFieldRelationship` at config load for a target that is genuinely
 * missing. `ProgressoAula.ts` carries the same helper for the same reason, and both go when
 * the types are regenerated.
 */
const pendingSlug = (slug: string): CollectionSlug => slug as CollectionSlug

/** The three states of a submission (FR-021). Exported so T029/T029b read them, not retype them. */
export const STATUS_SUBMISSAO = ['enviada', 'aprovada', 'recusada'] as const

export type StatusSubmissao = (typeof STATUS_SUBMISSAO)[number]

const ROTULOS_STATUS: Record<StatusSubmissao, string> = {
  enviada: 'Enviada',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
}

/**
 * The one value a maker may write: their own submit, and CLR-015's reopen of a rejected row.
 * The other two are the review's outcome and belong to the team (FR-021).
 */
const STATUS_DO_MAKER: StatusSubmissao = 'enviada'

/** The `status` this write is setting, or `undefined` when it sets none. */
const statusSendoEscrito = (siblingData: unknown, data: unknown): unknown => {
  const sibling = (siblingData as { status?: unknown } | undefined)?.status
  return sibling ?? (data as { status?: unknown } | undefined)?.status
}

/** A `tenant` reference — an id or a populated document — as one comparable string. */
const idDoTenant = (ref: unknown): string | null => {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object' && 'id' in ref) return String((ref as { id: unknown }).id)
  return String(ref)
}

/** The tenant ids inside the `{ tenant: { in: [...] } }` constraint `teamOnly()` answers with. */
const idsDoConstraint = (decisao: unknown): (string | number)[] => {
  const clause = (decisao as { tenant?: { in?: unknown } } | null | undefined)?.tenant?.in
  return Array.isArray(clause) ? (clause as (string | number)[]) : []
}

/**
 * **Approving and rejecting are the team's verbs; submitting is the maker's** (FR-021, FR-022).
 *
 * The collection-level rules below cannot draw this line: `create` and `update` are
 * `scopedAccess()` because the maker genuinely writes this row — they submit it, and CLR-015
 * reopens a rejected one by having them *edit* it. What they must not write is the review's
 * **outcome**. With `status` freely writable, a maker is one PATCH away from `aprovada` on
 * their own submission, and T029's approval hook then credits 1 XP in whichever skill the
 * mission names — the maker mints the XP and the system's own hook signs it.
 *
 * So the check is on the **value**, not merely on the field, exactly as `canPublishField`
 * decided for `publicado`. A version that asked only *"may this user write `status`?"* would
 * refuse the maker's own submit and their reopen, which is the transition CLR-015 exists for
 * and the reason a rejection means *"not yet"* rather than exile.
 *
 * **Not `canPublishField` reused, and not `teamOnly` handed to a field.** The vocabularies
 * differ — the queue reviews *submissions* (`enviada/aprovada/recusada`), not content
 * (`rascunho/em_revisao/publicado`) — and Payload types `FieldAccess` as returning a boolean,
 * with no place to put a `Where`, so `teamOnly`'s move of answering with a constraint is
 * unavailable one level down. Coercing the constraint would publish it as a truthy `true`:
 * staff of any lab approving every lab's submissions. `teamOnly()` is therefore *invoked* here
 * and its answer inspected, so "who is the team, and in which labs" stays one implementation.
 *
 * `doc` is read before `data` for `canPublishField`'s measured reason: `doc` is the stored row
 * while `data` is attacker-shaped input, and a maker of lab B who could name lab A in the
 * payload would approve by claiming a tenant they are staff of. When neither names a tenant (a
 * partial update sending only the changed field) the answer given is the one that holds
 * whichever document it turns out to be: the user is on the team in *every* org they belong to.
 *
 * Declared on **create as well as update**. On create there is no `previousDoc` for T029's
 * hook to compare against, so a submission POSTed straight into `aprovada` is the same mint
 * through a different verb — the class of hole T025 shipped by guarding only `create`, read in
 * the mirror.
 *
 * @example
 *   // In a field config:
 *   { name: 'status', type: 'select', access: { create: canReviewSubmissionStatus, update: canReviewSubmissionStatus } }
 */
export const canReviewSubmissionStatus: FieldAccess = async ({ req, data, doc, siblingData }) => {
  const valor = statusSendoEscrito(siblingData, data)
  if (valor === undefined || valor === null || valor === STATUS_DO_MAKER) return true

  const decisao = await teamOnly()({ req } as never)
  // `false` is "no team membership anywhere"; `true` is master, for whom the plugin adds no
  // tenant clause at all (spike S3) — the same single exception `scopedAccess` makes.
  if (decisao === false) return false
  if (decisao === true) return true

  const equipeEm = idsDoConstraint(decisao)
  const origem = doc ? (doc as { tenant?: unknown }) : (data as { tenant?: unknown } | undefined)
  const tenant = idDoTenant(origem?.tenant)
  if (tenant === null) return equipeEm.length === tenantIdsOf(req?.user as never).length

  return equipeEm.some((id) => String(id) === tenant)
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

/** The slice of a submission the credit reads, at `depth: 0` or populated. */
type Submissao = { id?: unknown; missao?: unknown; maker?: unknown; status?: unknown }

/** The slice of a write and of the stored row the reopen reads. */
type EscritaSubmissao = { status?: unknown; comprovante?: unknown }

/**
 * The `beforeChange` arguments this hook reads, named narrowly for `stampApproval`'s measured
 * reason: it stays callable from a unit test without fabricating a `PayloadRequest`, and
 * `missao-reabertura.test.ts` pins the assignability to `CollectionBeforeChangeHook` so the
 * narrowing cannot quietly break the wiring.
 *
 * `originalDoc` is `undefined` on create — there is no rejection to reopen yet.
 */
type ReaberturaWrite = {
  data: Record<string, unknown> & Partial<EscritaSubmissao>
  originalDoc?: Partial<EscritaSubmissao>
}

/**
 * **A rejected submission is REOPENED, never replaced** (T029b, FR-041, FR-023, SC-022,
 * CLR-015): the maker edits it and it returns to `enviada`.
 *
 * Without this, a rejection is permanent. FR-023's unique index refuses a second row for the
 * same (mission, maker); T027 froze `missao` and `maker` so the existing row cannot be
 * re-pointed at another mission; `delete` is `teamOnly()` so the maker cannot start over. Each
 * of those is right on its own, and together they mean one `recusada` bars the maker forever —
 * which is punitive and certainly not intended, because a rejection means *"not yet"* and a
 * review queue whose only outcome is exile is not a review queue.
 *
 * **The trigger is the maker editing the PROOF, not merely saving the row.** `comprovante` is
 * the one field a maker may still write — FR-036 names one photo and nothing else, and the
 * collection docstring records why no free-text note was smuggled in — so *"the maker edits
 * it"* and *"the photo changed"* are the same event. Reopening on any write instead would let
 * a team member who opens and re-saves a rejected row silently un-reject it, and would grow
 * the queue with rows nobody resubmitted.
 *
 * **An explicit status on the write wins**, and that is not politeness: the team may approve a
 * rejected submission directly, and a hook that overwrote `aprovada` with `enviada` would make
 * a rejected submission unapprovable and T029's credit unreachable. The stored value arriving
 * back on the write is not such a decision, though — the admin UI PATCHes the whole document,
 * so a maker's save carries `status: 'recusada'` (field access drops it afterwards, one layer
 * down, because rejecting is the team's verb). A guard that asked only *"does the write name a
 * status?"* would therefore refuse to reopen through the admin UI, which is the exact case
 * FR-041 is about. Only a status **different from the stored one** stops the reopen.
 *
 * `beforeChange` rather than `afterChange`: the reopen is part of the maker's own write, so it
 * belongs on the data going in — one row, one UPDATE, the same transaction. An `afterChange`
 * that re-updated the row would be a second write racing the first, and would re-enter the
 * hook chain.
 *
 * Pure and synchronous — no `payload.find/update`, no SQL. It decides; the operation it is
 * attached to does the writing.
 *
 * @example
 *   // In a collection config:
 *   hooks: { beforeChange: [reabrirRecusada] }
 */
export const reabrirRecusada = ({
  data,
  originalDoc,
}: ReaberturaWrite): Record<string, unknown> => {
  if (originalDoc?.status !== 'recusada') return data

  const decidindoOutroStatus = data.status !== undefined && data.status !== 'recusada'
  if (decidindoOutroStatus) return data

  const provaAnterior = idDaRelacao(originalDoc.comprovante)
  const provaNova = data.comprovante === undefined ? provaAnterior : idDaRelacao(data.comprovante)
  // Compared as ids: a relationship arrives as a bare id at `depth: 0` and as the document
  // above it, so comparing the raw values would read a genuine new photo as unchanged.
  // `null` is a write clearing a `required` field — validation refuses it, and reopening on
  // the way past would put a row with no proof back in the queue.
  if (provaNova === null || String(provaNova) === String(provaAnterior)) return data

  return { ...data, status: STATUS_DO_MAKER }
}

/**
 * **The skill the mission names** (FR-022) — read from `missao`, and from nowhere else.
 *
 * This is the half of FR-022 that is easy to get wrong cheaply. A submission carries no skill
 * column at all, so the only alternatives to this read are inventing one (a field the maker
 * could write, which is a maker choosing which skill to mint XP in) or crediting `null` (a
 * total with no skill, which FR-039 allows for a *publication* that names none and which a
 * mission never is — `missao.skill` is `required` precisely so an approval always has
 * somewhere to put the XP).
 *
 * Through the choke point on the **caller's own `req`**, so the read is confined to the
 * approving organization and joins the approving transaction. `findByID` there is issued as a
 * tenant-constrained `find`, so a mission of another lab matches zero rows and returns `null`
 * rather than being fetched and then judged.
 *
 * @throws Error when the mission cannot be read here, or names no skill. That takes the
 * approval down with it, which is the correct outcome and not a harsh one: `missao` is
 * `required`, `sameTenant`-validated and frozen after the create, so neither state is one a
 * reviewer can reach by approving — they mean the catalogue is broken. Crediting anyway would
 * write an entry indistinguishable from a real one, in the wrong skill or in none, and every
 * projection derived from the ledger would inherit it.
 */
const skillDaMissao = async (req: PayloadRequest, missao: number): Promise<string | number> => {
  const store = await getTenantScopedPayload(req)
  const linha = await store.findByID<{ skill?: unknown }>({
    collection: 'missao',
    id: missao,
    depth: 0,
  })

  if (linha === null) {
    throw new Error(
      `missao ${String(missao)} is not readable in this organization, so the approved ` +
        'submission names no skill to credit (FR-022 credits the skill the mission names)',
    )
  }

  const skill = idDaRelacao(linha.skill)
  if (skill === null) {
    throw new Error(
      `missao ${String(missao)} names no skill (got ${JSON.stringify(linha.skill)}), so there ` +
        'is nowhere to put the XP this approval owes; missao.skill is required for exactly ' +
        'this reason (FR-022)',
    )
  }
  return skill
}

/**
 * **The submission is attributed to whoever sent it** (T027, FR-021).
 *
 * `maker` is frozen on `update`, and that is only half of the story: a forged **create** never
 * needs to update anything. FR-021 is *"a maker submits a completion"* — the row IS the record
 * of who submitted — so `maker` cannot be a value the client chooses.
 *
 * Measured through the real collection before it was closed, not read off the source:
 * `tests/content/missao-autoria.test.ts` filed a submission signed in as one maker while naming
 * another, with `overrideAccess: false`, and the row came back carrying the other maker's id.
 *
 * What that bought an attacker is worse here than on the collections carrying the same shape,
 * because this one deliberately makes the pair permanent: `(missao, maker)` is unique, `maker`
 * cannot be re-pointed, and `delete` is `teamOnly()`. The forged row permanently occupies the
 * victim's one-row-forever slot for that mission (FR-023), fills the team's queue with work
 * attributed to somebody who did nothing, and — since {@link creditarAprovacao} resolves from
 * the row's own `maker` — hands them the XP on approval (FR-022), feeding the ranking of
 * CLR-007.
 *
 * **Create only**, for `attributeProgressToRequester`'s reason one file over: an update carries
 * a new photo and a reopen, never a change of author, and re-stamping it with whoever happens
 * to be signed in would rewrite history rather than record it. The `update: () => false` on the
 * field is what covers that verb; the two together are the whole rule.
 *
 * **A request with no user keeps the attribution it supplies.** `create: scopedAccess()` refuses
 * an anonymous request one layer up — that is the layer which actually sees requests — so this
 * branch is only ever reached by trusted server code: the seed, a migration, the tenancy
 * fixtures. A hook that threw here would make the collection unseedable and take the isolation
 * harness down with it (`attributeProgressToRequester`, verbatim).
 *
 * **A signed-in requester with no profile in this lab is refused, not silently attributed.**
 * There is nobody for the credit to land on, `maker` is `required`, and the alternative —
 * falling back to whatever the client sent — is the hole this hook exists to close.
 */
export const attributeSubmissionToRequester: CollectionBeforeValidateHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data
  if (!req?.user) return data

  let perfil: { id: string | number } | null
  try {
    perfil = await perfilDoUsuarioNesta(req, req.user as never)
  } catch (erro) {
    // A server-side write with no host — the choke point quite correctly refuses to guess an
    // organization, and the same reasoning `creditarConclusao` records applies: refusing the
    // write would break seeding to enforce an attribution the seed already supplied honestly.
    if (!(erro instanceof TenantUnresolvedError)) throw erro
    return data
  }

  if (!perfil) {
    throw new Error(
      `missaoSubmissao: o usuário ${String((req.user as { id?: unknown }).id)} não tem ` +
        'perfilMaker nesta organização, e uma submissão precisa de um maker para creditar',
    )
  }

  return { ...(data ?? {}), maker: perfil.id }
}

/**
 * **The mission credit** (T029, FR-022, SC-012, US3): one ledger entry the first time a
 * submission becomes `aprovada`, written inside the approving write's own transaction.
 *
 * **It fires on the TRANSITION, never on the state.** An approved submission stays approved,
 * and the row keeps being written afterwards — a reviewer corrects a typo, a later task
 * touches it. A hook that asked only *"is this row approved?"* would call `creditXp` on every
 * one of those writes. It would not double-credit: `creditXp` reads the ledger before
 * inserting and the unique index is the arbiter behind it (FR-003), so the second call returns
 * `false`. But it would spend an economy read and a ledger query inside every edit, and it
 * would make US3's *"the second approval credits nothing"* a property of somebody else's index
 * rather than of this hook. `previousDoc?.status` is what makes the second approval cost
 * nothing at all.
 *
 * `afterChange`, for `creditOnApproval`'s reason two collections over: it is verified to run
 * inside the operation's transaction in Payload 3.88, which is what FR-004 requires of the
 * entry, and it sees the status already written rather than racing the write that sets it.
 *
 * **The key is `(tenant, maker, concluir_missao, missao, missaoId)`** — the same shape every
 * other action uses, composed by `xpLedger`'s own `beforeValidate` and never here. It is keyed
 * on the **mission**, not on the submission, which is what makes it the same key across a
 * deleted-and-resubmitted row: FR-023 keeps one submission per (mission, maker) forever, and
 * `delete: teamOnly()` leaves a correction path a team member could use to reset one. Keying
 * on the submission id would turn that correction into a second credit.
 *
 * **No profile bridge, unlike the class completion.** `maker` is already a `perfilMaker` — the
 * scoped profile XP belongs to — so there is nothing global to resolve here. Its `null` case
 * is therefore not the class completion's *"watched a class at a lab they never joined"*,
 * which is a real state that warns; a submission with no maker cannot exist (`required`, and
 * frozen after the create), so reaching it means the row is broken and the approval fails.
 *
 * Registered on the collection below rather than exported for someone to remember: a hook that
 * is written and never wired credits nothing, and nothing in the type system objects.
 */
export const creditarAprovacao: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const linha = doc as Submissao
  if (linha.status !== 'aprovada') return doc
  // Already credited: the approval was carried in by the write before this one. US3's two
  // reviewers land here — the second one sees `aprovada` on both sides and returns.
  if ((previousDoc as Submissao | undefined)?.status === 'aprovada') return doc

  const missao = idDaRelacao(linha.missao)
  const refId = Number(missao)
  if (!Number.isInteger(refId)) {
    // The id is half of the idempotency key. A non-numeric one composes a key that matches
    // nothing, so the same mission would credit again on every approval — louder here than in
    // a ledger nobody can reconcile.
    throw new Error(
      `missaoSubmissao ${String(linha.id)} names a non-numeric missao ` +
        `(${JSON.stringify(missao)}), so no xpLedger entry can name it; xpLedger.refId is an ` +
        'integer and half of the key',
    )
  }

  const perfil = idDaRelacao(linha.maker)
  if (perfil === null) {
    throw new Error(
      `missaoSubmissao ${String(linha.id)} was approved but names no maker ` +
        `(${JSON.stringify(linha.maker)}), so the XP it owes has no owner; maker is required ` +
        'and frozen after the create, so this row is broken rather than merely unattributed',
    )
  }

  try {
    const skill = await skillDaMissao(req, refId)
    // Awaited, and its rejection deliberately uncaught — that is what keeps the entry inside
    // the approving write's transaction rather than beside it (FR-004, SC-003). The one named
    // exception is below, for the reason `creditOnApproval` measured.
    await creditXp({ req, perfil, skill, acao: 'concluir_missao', refTipo: 'missao', refId })
  } catch (erro) {
    // **A write with no host is a SERVER-SIDE write** — a seed, a migration, the tenancy
    // fixtures — not a reviewer's approval. The choke point quite correctly refuses to guess an
    // organization there, and letting that refusal out of an `afterChange` hook would roll back
    // a row nobody did anything wrong to write. Measured on `creditOnApproval` (`Projeto.ts`),
    // where registering the hook turned an unrelated Local API test red.
    //
    // The error type is the check: re-deriving "is there a host on this req" here would be a
    // second opinion on a question `lib/tenancy` owns. Anything else propagates.
    if (!(erro instanceof TenantUnresolvedError)) throw erro
    console.warn(
      `[xp] submissão da missão ${String(refId)} aprovada sem host na requisição (escrita de ` +
        'servidor); nada creditado',
    )
  }

  return doc
}

/**
 * What a maker did about a mission — **one row per (mission, maker), forever** (T027, FR-021,
 * FR-023, FR-036).
 *
 * `missao` (T026) is the catalogue the team publishes; this is the other half. Keeping them
 * apart is what lets FR-024 show the same mission to a signed-out visitor with no personal
 * percentage at all: the mission renders from a collection that carries nobody's attempt.
 *
 * **The proof is a `midiaImagem` relationship** (FR-036, CLR-006). Not a text key, not a URL,
 * not a filename: media is a relationship (002's D3), and a second upload path built for one
 * collection is precisely what that rule exists to prevent. Attaching it this way inherits
 * 002's presigned PUT, its post-upload verification and its size limits rather than
 * reimplementing them — and it is why missions sit on the **upload trust boundary**, so
 * constitution Principle 5's security review applies to them (T031 is that review: the write
 * must refuse a key, a URL, a filename and another maker's media).
 *
 * **`(missao, maker)` is a unique index, at the database** (FR-023). "One submission per
 * mission per maker" is only a guarantee while a second row cannot exist; an application check
 * loses to two concurrent POSTs — `PendingInvites.ts` records paying for exactly that race,
 * two writers both reading zero rows and both inserting. Both sides are single-target
 * relationships, so unlike `curtida`'s polymorphic `conteudo` there IS a column pair for
 * Postgres to constrain, and `indexes` (Payload 3.88 `CompoundIndex`) expresses it directly.
 * T028's migration carries it to the database, where it does the work.
 *
 * **The pair is frozen after the create, and that is CLR-015 rather than tidiness.** The index
 * refuses a *second* row; nothing in it objects to the existing row being re-pointed. CLR-015
 * says the row is one (mission, maker) **forever** — a rejection sets `recusada`, the maker
 * edits *the photo*, and it returns to `enviada` (T029b) — so `missao` and `maker` are
 * `access.update: () => false`. Without that, a maker re-points a rejected submission at
 * another mission, or re-attributes a lab-mate's row to themselves so the T029 credit lands on
 * them. Payload drops a field the requester may not write rather than failing the operation,
 * which is what is wanted: the rest of that PATCH is the legitimate edit.
 *
 * **Known gap, priced rather than discovered.** `scopedAccess` scopes to the *lab*, not to the
 * row, so a member of lab A can create a submission naming another member of lab A as `maker`,
 * or edit their row. That is not self-credit — the frozen `maker` means the XP still lands on
 * whoever the row names — but it does let one maker occupy another's (mission, maker) slot.
 * `perfilMaker`, `curtida` and `progressoAula` carry the same gap for the same reason, and all
 * of them close with an "own row" constraint joining the profile to `req.user`, which is a
 * change to the shared access layer rather than to this collection.
 *
 * Declared **between `missao` and `xpLedger`** (`regrasXp → missao → missaoSubmissao →
 * xpLedger`): seeding walks `SCOPE_REGISTRY` forward and `resetWorld` deletes in reverse, so a
 * collection is declared before anything pointing at it. The `tenant` field is injected by the
 * multi-tenant plugin, so it is not declared here; registration in `payload.config.ts` and the
 * `SCOPE_REGISTRY` entry land together in **T028** — `registry.test.ts` diffs config against
 * registry in both directions, so the two cannot be added separately.
 *
 * **Deliberately absent, with the reason:** a `motivo`/`observacao` note. CLR-015 mentions the
 * maker editing "a new photo, a new note", but FR-036 names **one photo** and nothing else, and
 * a free-text field on the upload trust boundary is a surface T031's review has not been
 * written against. It is an addition the review queue can ask for; it is not one to smuggle in
 * under a task whose columns the spec enumerates.
 */
export const MissaoSubmissao: CollectionConfig = {
  slug: 'missaoSubmissao',
  // Nothing is written to `payload-locked-documents` for this collection, so there is nothing
  // in it for another organization to enumerate (FR-018, CLR-004) — that internal collection
  // is not scoped by the plugin and each row names a document by collection and id. Locking is
  // ON by default (the predicate is `lockDocuments !== false`), so the leak reopens by
  // omission rather than by an edit. Same switch, same reason, as `missao` beside it.
  lockDocuments: false,
  // **FR-023, at the database and not in a hook a second writer could race.** See the
  // docstring: the index refuses the second row, and the frozen pair below is what stops the
  // first one from moving instead.
  indexes: [{ fields: ['missao', 'maker'], unique: true }],
  hooks: {
    // FR-021's attribution: `maker` is the requester's own profile, never the one the payload
    // names. Registered here rather than written here, so a hook that exists and is not wired
    // cannot pass a direct-call assertion while doing nothing (`review.test.ts`, stampApproval).
    beforeValidate: [attributeSubmissionToRequester],
    // CLR-015's reopen (FR-041), on the way in: the maker's new photo carries the row back to
    // `enviada` in the same UPDATE, so one rejection does not bar them behind the unique index
    // forever.
    beforeChange: [reabrirRecusada],
    // The credit of FR-022, reading the status this write just set. Registered here rather
    // than written here: `creditarAprovacao` is above, and the entry it writes joins this
    // write's own transaction.
    afterChange: [creditarAprovacao],
  },
  labels: {
    singular: 'Submissão de missão',
    plural: 'Submissões de missões',
  },
  admin: {
    // No text field to title a row with: a submission *is* the mission, who sent it and what
    // the review decided, so the list shows that rather than inventing a label for it.
    defaultColumns: ['missao', 'maker', 'status', 'updatedAt'],
    description:
      'Conclusões de missões enviadas pelos makers desta organização. A equipe aprova ou recusa; a aprovação concede 1 XP na skill da missão.',
    group: 'Conteúdo',
  },
  // The custom-endpoint surface of the isolation harness (FR-019, CF-9). Not decoration:
  // `isolation.test.ts` throws for a scoped collection that declares no `/mine`, because a
  // surface with no subject asserts nothing.
  endpoints: [scopedListEndpoint('missaoSubmissao')],
  access: {
    // A constraint, never a boolean (FR-006): a boolean authorises the operation and then
    // leaks every row — here the other lab's submissions and the photos attached to them.
    read: scopedAccess(),
    // Submitting is the maker's own act; nobody approves a submission into existence. The
    // anonymous POST is refused by `scopedAccess`'s own `if (!user) return false` — FR-024's
    // signed-out visitor sees the mission and an invitation to sign in, and submits nothing.
    create: scopedAccess(),
    // **Not `teamOnly()`, deliberately.** The team writes the outcome, but CLR-015 reopens a
    // rejected row by having the *maker* edit it, and a team-only update would bar them
    // permanently after one rejection — through the unique index, which is exactly the punitive
    // reading CLR-015 was written to refuse. The outcome is guarded one level down, on the
    // `status` field, where the *value* can be examined.
    update: scopedAccess(),
    // **The row is the review history, so deleting is the team's.** A maker who could delete
    // their own submission would make "one row per mission per maker, forever" last until they
    // pressed delete: the rejection disappears and the team member reviewing the next attempt
    // cannot see that this is the second one. `teamOnly()` leaves a correction path for a
    // genuinely wrong row without opening it to the person the row is about — the same
    // reasoning `progressoAula.delete` records for its anti-farm half.
    delete: teamOnly(),
  },
  fields: [
    {
      name: 'missao',
      type: 'relationship',
      relationTo: pendingSlug('missao'),
      required: true,
      // Every read of this collection asks either "what did this maker submit?" or "what is
      // waiting on this mission?", and the review queue is the second one.
      index: true,
      label: 'Missão',
      admin: {
        description: 'A missão que esta submissão conclui. Uma linha por missão e por maker.',
      },
      // Both sides are scoped, and spike S4c measured the plugin ACCEPTING a row in A updated
      // to reference a row in B. The shared validator, never a local reimplementation: a
      // submission could otherwise complete a neighbouring lab's mission, and the credit would
      // name that lab's skill. `sameTenant` also enforces the `required` floor, because a
      // declared `validate` REPLACES Payload's default.
      validate: sameTenant,
      access: {
        // Frozen after the create — see the docstring. The unique index refuses a second row;
        // this is what stops the first one from being re-pointed at another mission.
        update: () => false,
      },
    },
    {
      name: 'maker',
      type: 'relationship',
      // The scoped profile, not the global `users` row: XP is per profile per organization
      // (plan § D3), so a credit resolved from a global account has nowhere to land.
      relationTo: 'perfilMaker',
      required: true,
      // Required also because Postgres treats NULLs as **distinct** in a unique index: a
      // nullable half of the pair would let unlimited unattributed submissions past the very
      // index meant to refuse the second one — `xpLedger.chaveIdempotencia` records the same
      // lesson one collection over.
      index: true,
      label: 'Maker',
      admin: {
        description: 'Quem enviou a submissão. Recebe o XP quando a equipe aprovar.',
      },
      validate: sameTenant,
      access: {
        // Frozen after the create: with this writable, a lab-mate's row could be
        // re-attributed to the requester and T029's credit would follow the name on the row.
        update: () => false,
      },
    },
    {
      name: 'comprovante',
      type: 'relationship',
      // **CLR-006 / FR-036 — a `midiaImagem` id and nothing else.** Never a key, a URL or a
      // filename: that would be a second upload route for one collection, skipping the
      // presigned PUT, the post-upload verification and the size limits 002 already tested.
      relationTo: 'midiaImagem',
      required: true,
      label: 'Comprovante',
      admin: {
        description: 'A foto que comprova a conclusão. Uma imagem, enviada pelo fluxo de mídia.',
      },
      // Scoped → scoped. Without it a maker attaches another lab's image and the reviewer
      // opens it from inside their own queue — the upload trust boundary CLR-006 names, and
      // one of the four wrong shapes T031's security review feeds this field.
      validate: sameTenant,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      // `enviada` is the state a submission is born in: it exists to be reviewed.
      defaultValue: 'enviada',
      options: STATUS_SUBMISSAO.map((value) => ({ label: ROTULOS_STATUS[value], value })),
      index: true,
      label: 'Status',
      admin: {
        description:
          'Enviada aguarda revisão; aprovada concede o XP; recusada volta para enviada quando o maker edita (CLR-015).',
      },
      // **The review vocabulary, not the content queue's.** `rascunho/em_revisao/publicado`
      // belongs to `artigo` and `projeto`, where `status` is also what the anonymous path
      // filters on; nothing public reads a submission, and these are the reviewer's states.
      //
      // The vocabulary does NOT keep this collection out of `derivePublishable`, and believing
      // it did was worth measuring. That derivation asked only whether a field *named* `status`
      // is queryable, so registering this collection put it in the publishable set — where the
      // anonymous filter is not the empty listing that rule assumed but a hard failure:
      //
      //   Failed query: select count(*) from "missao_submissao" where "status" = $1
      //     Caused by: invalid input value for enum enum_missao_submissao_status: "publicado"
      //
      // `declaresQueryableStatus` now asks the field's own options as well, so a `status` that
      // cannot say `publicado` is excluded — this collection among them. What keeps a proof
      // photo away from a signed-out visitor is that exclusion plus `read: scopedAccess()`,
      // never the choice of words here.
      access: {
        // Only the team writes the outcome — the whole argument is on the function.
        create: canReviewSubmissionStatus,
        update: canReviewSubmissionStatus,
      },
    },
  ],
}
