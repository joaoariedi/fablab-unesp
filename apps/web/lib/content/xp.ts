import { levelFor, type XpRules } from '@fablab/game'
import type { PayloadRequest, Where } from 'payload'

import type { AcaoXp, RefTipoXp } from '../../collections/content/XpLedger'
import { CrossTenantError, getTenantScopedPayload, type TenantScopedPayload } from '../tenancy'

/**
 * The credit (T015, FR-003, FR-004) — **one function owns the ledger write, and it runs on the
 * caller's own transaction.**
 *
 * Constitution Principle 3, verbatim: *"XP is granted inside the same transaction as the action
 * that caused it"*. The mechanism is `counters.ts`'s, reused rather than reinvented — Payload
 * joins an operation to an open transaction through `req.transactionID`, so the whole of it is
 * that the **causing write's own `req`** reaches the choke point, the create is awaited, and a
 * failure is allowed to propagate. A fresh request, an `after: commit`, or a swallowed
 * rejection each severs the credit from the action, and the severance is silent: the project
 * publishes, no entry exists, and nothing reports it.
 *
 * The one refusal that is **not** a failure is the duplicate, and it is the point of the
 * module — see {@link isDuplicateLedgerEntry}.
 */

/**
 * The slice of the choke-point client this needs — narrowed for the reason `CounterStore` is:
 * a credit has no business deleting anything, and a type that cannot express that operation
 * says so more durably than a comment. `find` reads the economy and the ledger rows the
 * projections are recomputed from.
 *
 * **`update` is here for the projections and for nothing else** (T016, FR-010): the ledger is
 * append-only by access control (FR-001), so the only row a credit ever updates is the
 * `perfilMaker` whose totals it just made stale. It is reached through the same client as the
 * create, deliberately — see {@link syncMakerProjections}.
 */
export type XpStore = Pick<TenantScopedPayload, 'create' | 'find' | 'update'>

export type XpDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests. */
  getStore?: (req: PayloadRequest) => Promise<XpStore>
}

/**
 * What a credit names. `quantidade` is deliberately absent: it is **not** the caller's to
 * decide (see {@link creditXp}).
 */
export type CreditInput = {
  /** The request the causing write is running under. Its transaction is the one joined. */
  req: PayloadRequest
  /** Who earns. Resolved by the caller — `progressoAula` names a *global* user, not a profile. */
  perfil: string | number
  /** Nullable, exactly as the column is: content that names no skill still credits the total. */
  skill?: string | number | null
  acao: AcaoXp
  refTipo: RefTipoXp
  refId: number
}

/**
 * The name Postgres gives the unique index on `xp_ledger (chave_idempotencia)` — read from
 * `pg_indexes` on the running database, 2026-09-14, and identical in the committed migration.
 *
 * Used only by the **second door** below. The first door never sees it, which is the finding
 * this whole module is shaped around.
 */
export const XP_LEDGER_UNIQUE_INDEX = 'chaveIdempotencia_idx'

/**
 * What a duplicate credit looks like **to the caller** — measured through the Local API against
 * a real duplicate, 2026-09-14, by `tests/content/xp-credit-idempotencia.test.ts` §2.
 *
 * **It is not the `23505` plan.md's sketch expects, and that is 004's T020 measurement holding
 * for a second index.** Postgres does raise `23505` naming `chaveIdempotencia_idx`;
 * `@payloadcms/drizzle`'s `handleUpsertError` intercepts it first and rethrows a
 * `ValidationError` carrying neither the SQLSTATE nor the index name. What survives is
 *
 *   `error.data.errors[0] === { message: 'Value must be unique',`
 *   `                           path: 'chave_idempotencia', tableName: 'xp_ledger' }`
 *
 * (The column name rather than the field name, because the adapter recovers it from Postgres's
 * `detail` — `Key (chave_idempotencia)=(…) already exists` — for every index it did not build
 * from a field-level `unique: true`. A table-level `indexes: [...]` entry, which is what FR-003
 * needs, is exactly such an index.)
 *
 * §2 of that test asks the running stack rather than this constant, so a Payload upgrade that
 * re-encodes the error fails there — loudly, in CI — instead of silently turning every
 * duplicate credit back into an unhandled error that rolls a valid action back.
 */
export const XP_LEDGER_UNIQUE_VIOLATION = Object.freeze({
  tableName: 'xp_ledger',
  path: 'chave_idempotencia',
})

/** The two error shapes, read as narrowly as they can be without asserting a class. */
type PayloadValidationShape = {
  data?: { errors?: ({ path?: string; tableName?: string } | null)[] }
}
type PostgresErrorShape = { code?: unknown; constraint?: unknown }

/**
 * Is this the idempotency index refusing a credit that was **already granted** — and not some
 * other failure?
 *
 * The distinction is the entire safety of the `catch` in {@link creditXp}. A blanket "unique
 * violation" test, or worse a bare `catch`, would report a dropped connection, a foreign key
 * naming a deleted profile, or a validator's refusal as *"already credited"* — the causing
 * write would then commit with no entry behind it, which is the precise inverse of FR-004 and
 * leaves nothing to notice it. Narrow is what makes the swallow safe.
 *
 * Two doors, and only one of them is the usual one:
 *
 *   1. **What the Local API actually raises** — see {@link XP_LEDGER_UNIQUE_VIOLATION}. This is
 *      the door every credit from a hook goes through.
 *   2. **The raw `23505` naming this index**, which is what plan.md's sketch expected and what
 *      a direct drizzle write, or a Payload version that stops intercepting, produces. Kept
 *      deliberately: dropping it fails *silently*, because a duplicate would simply escape and
 *      roll back an action that was already correct, and no type would object.
 *
 * Duck-typed rather than `instanceof ValidationError`: two copies of `payload` in a pnpm tree
 * make that check false for an error that is one, and a wrong `false` here turns FR-025's
 * no-op — rewatching a class, re-approving a project, the loser of two concurrent approvals —
 * into a crash that undoes the action.
 */
export const isDuplicateLedgerEntry = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false

  const errors = (error as PayloadValidationShape).data?.errors ?? []
  const byPayload = errors.some(
    (e) =>
      e?.tableName === XP_LEDGER_UNIQUE_VIOLATION.tableName &&
      e?.path === XP_LEDGER_UNIQUE_VIOLATION.path,
  )
  if (byPayload) return true

  const { code, constraint } = error as PostgresErrorShape
  return code === '23505' && constraint === XP_LEDGER_UNIQUE_INDEX
}

/**
 * This organization's economy, read at credit time (FR-009).
 *
 * All three tunables, not only the rate: `xpPorAcao` is what the entry records, and
 * `xpPorNivel`/`nivelMaximo` are the curve {@link levelFor} turns a total into a level on
 * (FR-007). They are read together because they are one row and one question — *what is the
 * economy here* — and reading the curve separately later would open a window in which a credit
 * and its projection were computed under two different economies.
 *
 * `quantidade` has no `defaultValue` on the column and no default here, and `XpLedger.ts`
 * carries the reason: a default would write the CITe economy into the schema, so a credit
 * created without an amount would silently record the seed rate at a lab that retuned its own.
 * `regrasXp` is one row per organization and the choke point confines the read to it, so
 * `limit: 1` is the whole query.
 *
 * @throws Error when the organization has no economy row, or one that is not fully numeric.
 * That takes the causing write down with it, which is the correct outcome and not a harsh one:
 * FR-009 seeds `regrasXp` on organization creation, so its absence is a broken lab rather than
 * a state a maker can reach. Inventing a rate — or a curve — instead would write entries and
 * levels indistinguishable from real ones, and every projection derived from the ledger would
 * inherit the invention.
 */
const rulesForTenant = async (store: XpStore): Promise<XpRules> => {
  const { docs } = await store.find<Partial<Record<keyof XpRules, unknown>>>({
    collection: 'regrasXp',
    limit: 1,
    depth: 0,
  })

  const row = docs[0]
  const { xpPorAcao, xpPorNivel, nivelMaximo } = row ?? {}
  if (
    typeof xpPorAcao !== 'number' ||
    typeof xpPorNivel !== 'number' ||
    typeof nivelMaximo !== 'number'
  ) {
    throw new Error(
      'no regrasXp row with a numeric xpPorAcao, xpPorNivel and nivelMaximo in this ' +
        `organization, so there is no economy to credit at (got ${JSON.stringify(row)} from ` +
        `${docs.length} row(s)). FR-009 seeds one per organization on creation — see ` +
        'lib/tenancy/seed-on-create.ts.',
    )
  }
  return { xpPorAcao, xpPorNivel, nivelMaximo }
}

/**
 * A sum reads rows, so it must say how many at a time — the constant `counters.ts` declares
 * for its own `sum` derivation, for the same reason: leaving `limit` off lets Payload apply
 * its default page size, and the sum then stops there, short by every row after it and
 * reporting no error at all.
 */
const LEDGER_PAGE_SIZE = 200

/**
 * Add `quantidade` across every ledger entry matching `where`, page by page.
 *
 * The loop ends on an empty page as well as on the count, so a ledger that changes under a
 * concurrent write terminates instead of paging forever.
 *
 * **Summed rather than counted, deliberately.** While `regrasXp.xpPorAcao` is 1 a sum and a
 * count agree, and `tests/content/xp-vs-count.test.ts` asserts that as a free oracle — never
 * as a mechanism this may lean on. The rate is tunable, which is why the amount is stored per
 * entry (plan § D2).
 */
const sumLedger = async (store: XpStore, where: Where): Promise<number> => {
  let total = 0
  let read = 0

  for (let page = 1; ; page += 1) {
    const { docs, totalDocs } = await store.find<{ quantidade?: unknown }>({
      collection: 'xpLedger',
      where,
      limit: LEDGER_PAGE_SIZE,
      page,
      depth: 0,
    })

    for (const doc of docs) total += typeof doc.quantidade === 'number' ? doc.quantidade : 0
    read += docs.length

    if (docs.length === 0 || read >= totalDocs) return total
  }
}

/** One row of the SUAS SKILLS panel, as `perfilMaker.skills[]` stores it at `depth: 0`. */
type LinhaSkill = { skill?: unknown; nivel?: number; xp?: number }

/**
 * The whole panel, with this skill's row recomputed and **every other row copied verbatim**.
 *
 * Payload writes an array field by replacing it, so the rows that were not credited have to be
 * handed back untouched — dropping them would erase progress FR-015 promises no credit ever
 * moves. Each row keeps its own `id`, which is what makes the write an update of these rows
 * rather than a delete-and-recreate of the panel.
 *
 * A skill with no row yet gets one appended: FR-017 assigns the catalogue at level 0, but a
 * profile that predates a skill (or a catalogue repaired later) would otherwise earn XP the
 * panel could never show, and the reconciliation gate would report the disagreement forever.
 */
const withSkillRow = (
  panel: LinhaSkill[],
  skill: string | number,
  xp: number,
  nivel: number,
): LinhaSkill[] => {
  const same = (row: LinhaSkill) => String(row.skill) === String(skill)
  const updated = panel.map((row) => (same(row) ? { ...row, xp, nivel } : row))
  return panel.some(same) ? updated : [...updated, { skill, xp, nivel }]
}

/** The maker's panel as currently stored. `[]` for a profile that carries none yet. */
const currentPanel = async (store: XpStore, perfil: string | number): Promise<LinhaSkill[]> => {
  const { docs } = await store.find<{ skills?: LinhaSkill[] }>({
    collection: 'perfilMaker',
    where: { id: { equals: perfil } } as Where,
    limit: 1,
    depth: 0,
  })
  return docs[0]?.skills ?? []
}

/**
 * Recompute the maker's projections from the ledger and store them, on the caller's
 * transaction (T016, FR-010).
 *
 * `perfilMaker.xpTotal`, `perfilMaker.nivel` and the maker's row in `skills[]` are not facts:
 * they are the ledger, recomputed. This is `counters.ts`'s discipline reused rather than
 * reinvented, and its three load-bearing properties are what make the reuse real — the
 * **caller's own `req`** reaches the choke point (so this write joins the transaction the
 * entry was written in), the write is **awaited**, and a failure **propagates** so the action
 * that caused the credit rolls back with it.
 *
 * **Recomputed, never incremented.** A `+= quantidade` accumulates every error it ever makes
 * and cannot self-heal; a recount is also what makes FR-011's reconciliation gate checkable at
 * all. It costs a sum per credit, which `counters.ts` prices where the `sum` derivation is
 * declared.
 *
 * `nivel` is `levelFor` from `@fablab/game` and nothing else: FR-007's curve and its cap live
 * there, which is why no column in the schema declares a `max` (CLR-013). A second expression
 * of the curve here would be a second thing to retune.
 *
 * @throws CrossTenantError when the update matches no row — a profile in another organization,
 * or one deleted underneath the write. Silence there is the one drift path the transaction
 * cannot catch, because nothing failed.
 */
const syncMakerProjections = async (
  store: XpStore,
  input: CreditInput,
  rules: XpRules,
): Promise<void> => {
  const doPerfil = { perfil: { equals: input.perfil } } as Where
  const xpTotal = await sumLedger(store, doPerfil)
  const data: Record<string, unknown> = { xpTotal, nivel: levelFor(xpTotal, rules) }

  // Untouched when the credit names no skill (FR-039): such a publication credits the total
  // and no skill, and rewriting the panel to say so would be a write with nothing to write.
  if (input.skill !== undefined && input.skill !== null) {
    const xp = await sumLedger(store, {
      and: [doPerfil, { skill: { equals: input.skill } }],
    } as Where)
    data.skills = withSkillRow(
      await currentPanel(store, input.perfil),
      input.skill,
      xp,
      levelFor(xp, rules),
    )
  }

  // Awaited, and its rejection deliberately uncaught: both are what keep this write inside the
  // caller's transaction rather than beside it.
  const written = await store.update({ collection: 'perfilMaker', id: input.perfil, data })

  if (!written) {
    throw new CrossTenantError(
      `perfilMaker ${String(input.perfil)} matched no row in this organization, so xpTotal was ` +
        `not updated to ${String(xpTotal)} and the ledger entry just written is unprojected`,
    )
  }
}

/**
 * Credit one action, once, on the caller's transaction (FR-003, FR-004).
 *
 * @returns `true` when an entry was written **and the maker's projections were recomputed from
 * the ledger**, `false` when this exact action had already been credited. **`false` is a
 * success**, not a failure: it is FR-025's no-op observed.
 *
 * @throws anything else the write raises, untouched — a dropped connection, a foreign key, a
 * missing economy. Uncaught on purpose: the causing write rolls back with it (SC-003).
 *
 * ── Why check-then-insert, and why insert-and-catch CANNOT work here ────────────────────────
 *
 * This was the opposite shape until it was measured, and the measurement is the whole reason
 * the module reads as it does.
 *
 * Insert-and-catch is the better instinct: the unique index is an arbiter that cannot lose a
 * race, where a read-then-write can. But **the catch never gets the chance to mean anything**.
 * Payload's `create` wraps the whole operation in
 * `catch (error) { await killTransaction(args.req); throw error }`
 * (`collections/operations/create.js`), and `killTransaction` calls
 * `payload.db.rollbackTransaction(req.transactionID)` **unconditionally** and then deletes the
 * id. `@payloadcms/drizzle` takes **no savepoint per operation** — there is no `SAVEPOINT`
 * anywhere in the adapter — so there is nothing to roll back *to*.
 *
 * Measured on this tree, not reasoned about: open a transaction, write an entry, write the
 * identical entry again, swallow the duplicate exactly as this function did, commit.
 *
 *     { reconhecido: true, txAindaNoReq: null, sobreviveram: 0 }
 *
 * The duplicate was recognised, the caller's transaction was **already destroyed**, and the
 * first, entirely valid entry **did not survive**. So the old shape returned `false` — *"already
 * credited, carry on"* — while the approval that called it had been rolled back underneath. It
 * reported success for the exact outcome it existed to prevent.
 *
 * So: **read first, inside the caller's transaction, and skip if the entry is there.** That
 * serves the case FR-025 is actually about — a re-approval, a rewatch, a republication — with
 * the caller's transaction untouched.
 *
 * ── What the unique index is for, now that it is not an arbiter the code consults ───────────
 *
 * It is the backstop, and it still cannot lose a race: two reviewers approving at the same
 * instant (US3's edge) both read zero rows, both insert, and **one of them loses**. That is the
 * correct outcome and not a regression — one approval commits, the other fails loudly, and the
 * retry reads the entry and skips. What is *not* available is pretending the loser succeeded,
 * which is what the catch was doing.
 *
 * `PendingInvites.ts` records this tree learning that a read-then-write loses races. It does.
 * The difference here is that the alternative loses them too, and lies about it.
 *
 * `chaveIdempotencia` is never composed here: `composeIdempotencyKey` (the collection's
 * `beforeValidate`) owns the format and overwrites whatever a caller sends. A key composed at
 * the call site would be a second format nobody maintains, and the index is exactly as sharp as
 * the string written into that column.
 *
 * ── Why the projections are written HERE, and not by the hook ───────────────────────────────
 *
 * An entry and the totals it changes are one fact (FR-010). Leaving the recount to each caller
 * would make "credit, then project" a two-step contract that four collection hooks, the class
 * completion and the mission approval would each have to remember — and the step nobody
 * remembers fails silently: the ledger grows, `xpTotal` does not, and only FR-011's
 * reconciliation gate ever notices. See {@link syncMakerProjections}.
 *
 * @example
 * // In a publishable's afterChange hook, on the approving write's own request:
 * await creditXp({
 *   req, perfil: doc.autor, skill: doc.skill,
 *   acao: 'publicar_artigo', refTipo: 'artigo', refId: doc.id,
 * })
 */
export async function creditXp(input: CreditInput, deps: XpDeps = {}): Promise<boolean> {
  const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req))
  const store = await getStore(input.req)

  const rules = await rulesForTenant(store)

  // Read first, on the caller's own store and therefore inside the caller's transaction. See
  // the docblock: catching the duplicate afterwards is not an option the framework leaves open.
  const { totalDocs } = await store.find({
    collection: 'xpLedger',
    where: {
      and: [
        { perfil: { equals: input.perfil } },
        { acao: { equals: input.acao } },
        { refTipo: { equals: input.refTipo } },
        { refId: { equals: input.refId } },
      ],
    } as never,
    limit: 1,
    depth: 0,
  })
  // Already credited — FR-003's no-op, and the case FR-025 is about. Nothing is written and the
  // caller's transaction is untouched, which is the whole point of reading rather than catching.
  if (totalDocs > 0) return false

  try {
    await store.create({
      collection: 'xpLedger',
      data: {
        perfil: input.perfil,
        skill: input.skill ?? null,
        acao: input.acao,
        refTipo: input.refTipo,
        refId: input.refId,
        quantidade: rules.xpPorAcao,
      },
    })
  } catch (erro) {
    // **Rethrown either way** — the caller's transaction is already dead by the time this runs,
    // so there is nothing to rescue and pretending otherwise is the defect this shape replaced.
    //
    // What the duplicate branch buys is a *message*. Reaching here means the read above found
    // nothing and the insert still collided, which has exactly one cause: a concurrent credit
    // for the same tuple committed in between — US3's two reviewers. The reviewer who loses
    // deserves to be told that, rather than a raw `ValidationError` about a column pair.
    if (isDuplicateLedgerEntry(erro)) {
      throw new Error(
        `um crédito concorrente para ${input.refTipo} ${String(input.refId)} venceu a corrida; ` +
          'esta aprovação foi desfeita e pode ser repetida — a próxima tentativa encontrará a ' +
          'entrada e não creditará de novo (FR-003)',
        { cause: erro },
      )
    }
    throw erro
  }

  // **Only after a write, and never after a duplicate.** A duplicate changed no ledger row, so
  // there is nothing to reproject — and a recount here would race the transaction that DID
  // write the entry over the same profile row (US3's two reviewers), each writing a total the
  // other cannot see.
  await syncMakerProjections(store, input, rules)

  return true
}

/**
 * The slice of the choke-point client the bridge below needs. `find` and nothing else: resolving
 * who earns is a read, and a type that cannot express a write says so more durably than a
 * comment — the same narrowing {@link XpStore} applies to a credit.
 */
export type PerfilLookupStore = Pick<TenantScopedPayload, 'find'>

export type PerfilLookupDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests. */
  getStore?: (req: PayloadRequest) => Promise<PerfilLookupStore>
}

/** What the bridge returns: enough to credit, which is the profile's own id. */
export type PerfilResolvido = { id: string | number }

/**
 * A `users` relationship as a caller may hold it — a bare id, or the document Payload populates
 * at the collection's depth. Both are accepted; see {@link perfilDoUsuarioNesta}.
 */
export type ReferenciaUsuario =
  | string
  | number
  // The populated document carries every other column of `users` with it, so the index
  // signature is not laxness: without it a caller passing the real document is rejected
  // by the excess-property check for holding the fields Payload actually populated.
  | { id?: unknown; [campo: string]: unknown }
  | null
  | undefined

/**
 * The id inside a `users` relationship, whichever of its two shapes arrived.
 *
 * `null` for anything else — a caller holding no user at all. It is deliberately **not** an
 * error: see the bridge's `@returns`.
 */
const idDoUsuario = (usuario: ReferenciaUsuario): string | number | null => {
  if (typeof usuario === 'string' || typeof usuario === 'number') return usuario
  if (typeof usuario === 'object' && usuario !== null) {
    const { id } = usuario
    if (typeof id === 'string' || typeof id === 'number') return id
  }
  return null
}

/**
 * Resolve a **global** `users` id to that person's profile in **this** organization (T022,
 * FR-006, US2, D3).
 *
 * The bridge exists because the two halves of a class completion do not name the same thing:
 * `progressoAula.usuario` is a row of the global `users` collection, and XP belongs to a
 * `perfilMaker`, which is scoped. One login can hold a profile at two labs (CLR-002), so
 * *"which profile earns"* has no answer until an organization is named.
 *
 * **The organization is never named here, and that is the design.** The read goes through
 * `getTenantScopedPayload(req)` — the choke point — which confines it to the request's
 * organization with `overrideAccess: false`. A `tenant` clause written into the `where` below
 * would be a second, hand-maintained copy of that rule; the one this file trusts is the one
 * every other read in the product trusts (CHK032).
 *
 * `depth: 0` because the caller needs an id, and `limit: 1` because one login holds at most one
 * profile per lab — the invariant CLR-002 states and `PerfilMaker.ts` explains it cannot yet
 * enforce with a `(tenant, usuario)` index.
 *
 * @returns the profile, or `null` when this person has **no profile in this organization** —
 * a real state, not an error (D3): somebody may watch a class at a lab they never joined.
 * `null` is also the answer for a caller holding no resolvable user reference at all, which is
 * the same question with the same answer — *nobody here earns this*. The caller's decided
 * response is one warning line and no credit; failing instead would roll back a watch that was
 * not wrong.
 *
 * @throws whatever the read raises, untouched (CHK045). *Nothing found* and *the read failed*
 * must stay distinguishable: collapsing an outage into `null` would make the completion hook
 * warn once and silently drop every credit in the lab, with every projection still agreeing
 * with a ledger that stopped growing.
 *
 * @example
 * // In progressoAula's afterChange hook, on the completing write's own request:
 * const perfil = await perfilDoUsuarioNesta(req, doc.usuario)
 * if (!perfil) return doc // no profile in this organization — warn, credit nothing
 * await creditXp({ req, perfil: perfil.id, acao: 'assistir_aula', refTipo: 'aula', refId: doc.aula })
 */
export async function perfilDoUsuarioNesta(
  req: PayloadRequest,
  usuario: ReferenciaUsuario,
  deps: PerfilLookupDeps = {},
): Promise<PerfilResolvido | null> {
  const id = idDoUsuario(usuario)
  if (id === null) return null

  const getStore = deps.getStore ?? ((pedido: PayloadRequest) => getTenantScopedPayload(pedido))
  const store = await getStore(req)

  const { docs } = await store.find<PerfilResolvido>({
    collection: 'perfilMaker',
    where: { usuario: { equals: id } } as Where,
    limit: 1,
    depth: 0,
  })

  return docs[0] ?? null
}
