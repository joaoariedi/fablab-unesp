import type { PayloadRequest } from 'payload'

import { syncCounter } from '../content/counters'
import { getTenantScopedPayload, tenantIdsOf, type TenantScopedPayload } from '../tenancy'

/**
 * T032 / FR-031, SC-010, US8 — **deletion: erase, keep the work, un-like, recount. Or none of it.**
 *
 * CLR-003 fixed the mechanism and named the reason: the erasure obligation is over **personal
 * data**, not over everything a person contributed. A lab's public library is built out of
 * those contributions, and other people's likes, downloads and class progress point at them, so
 * withdrawing the work with the person would let one departure silently remove teaching
 * material. Three outcomes follow, and this module owes all three:
 *
 *   1. **the personal data goes** — the `perfilMaker` row, where every field a person typed
 *      about themselves lives (`PerfilMaker.ts`), is deleted;
 *   2. **the published work stays**, with `autor` nulled on `artigo`, `aula` and `modelo3d`.
 *      The tombstone is a *rendering* state (`CardProjetoAutor`'s `{ removido: true }`), never
 *      a placeholder profile row — a row is something data can later be attached to;
 *   3. **the likes go, and the counters are recomputed** — a like is an act by a person, not a
 *      contribution.
 *
 * ── One transaction, and what that is actually made of ────────────────────────────────────
 *
 * The client is built **once**, from the caller's `req`, and every read and write goes through
 * it. Payload joins an operation to the open transaction through `req.transactionID`, so a
 * second client is a second connection and lands outside it (`lib/tenancy/system-payload.ts`,
 * `lib/content/counters.ts`). Nothing here catches a failure, for the same reason `signup.ts`
 * catches nothing: an error must reach the caller so the request's transaction rolls back. The
 * partial state a swallow would leave is unrepairable — likes deleted with the counters
 * untouched is exactly the silent drift `counters.ts` exists to prevent, and a nulled `autor`
 * with the profile still present is content that lost its byline for nothing.
 *
 * ── Why the recount and not a decrement ───────────────────────────────────────────────────
 *
 * {@link syncCounter}'s `count` derivation recomputes `curtidas` from the `curtida` rows
 * themselves, so it self-heals drift a `delta` would carry forward. It is called with
 * `getStore: () => store` so it writes on **this** transaction rather than opening its own.
 *
 * ── The global `users` row is shared, so it is the last question and not the first ─────────
 *
 * One login may hold profiles in two labs (002 § CLR-002). Deleting the account because *this*
 * lab's profile is gone would erase a person from a lab that never heard about it. Two readings
 * answer that, and each answers only half:
 *
 *   - the **profile count**, issued after the delete and inside this transaction, which the
 *     choke point correctly confines to this organization — so it answers *"does this lab still
 *     hold a profile for this login"* (a second profile in the same lab is not a shape that
 *     should exist, and if it does, the account stays);
 *   - the **memberships on the global `users` row** (`orgs[]`, read through the same client
 *     because `users` is global and therefore unfiltered), which is the only cross-organization
 *     reading a correctly scoped client can make. It answers *"does any other lab"*.
 *
 * Counting **inside** the transaction is the part the plan states explicitly: two labs deleting
 * the same person at once then serialise on the row — one sees something remaining and stops,
 * the other sees none and deletes. Counting outside is how both see "one left" and neither
 * deletes.
 *
 * **Known bound, stated rather than discovered.** `users.delete` is `masterOnly()` and
 * `artigo`/`aula`/`modelo3d` still declare `autor` as `required: true` in their configs (the
 * T029 migration dropped only the database's NOT NULL, deliberately). So the two writes this
 * module performs outside its own collection depend on the caller's client being allowed to
 * make them; `deps.getStore` is the seam where that door is supplied, exactly as `signup.ts`
 * receives `getSignupScopedPayload`. Nothing is relaxed here and nothing is swallowed: a
 * refusal propagates and the whole erasure rolls back, which is the loud failure.
 */

/** The slice of the choke-point client this needs. `tenantId` is part of it because the
 *  cross-lab question above is asked against it — see the docblock. */
export type DeletionStore = Pick<
  TenantScopedPayload,
  'find' | 'findByID' | 'update' | 'delete' | 'tenantId'
>

/**
 * The collections that carry an author and therefore a tombstone (CLR-003).
 *
 * `projeto` is deliberately absent: it has no `autor` relationship yet — its author arrives
 * with the collection's own feature, and the plan names that as the reason the tombstone is a
 * `packages/ui` change first. A collection added here without a nullable column is a write
 * that fails, which is the loud half; one *forgotten* here is a byline that survives the
 * erasure, which is the silent half — so the list is a constant a reviewer can diff against
 * `CardProjetoAutor`'s consumers rather than three literals inline.
 */
export const COLECOES_COM_AUTOR = ['artigo', 'aula', 'modelo3d'] as const

/**
 * `limit: 0` — Payload's documented "no limit" (`find.js`: `limit ?? (usePagination ? 10 : 0)`).
 * The default of **ten** would leave the eleventh like and the eleventh article behind, with
 * nothing reporting it: a partial erasure that looks exactly like a complete one.
 */
const TODAS_AS_LINHAS = 0

/** `limit: 1` because only `totalDocs` is wanted — the rows themselves are never needed. */
const CONTAGEM_APENAS = 1

export type DeleteAccountInput = {
  /** The request the deletion runs under. Its transaction is the one every write joins. */
  req: PayloadRequest
  /** The profile being erased — this lab's, resolved from the session by the caller. */
  perfilId: string | number
}

export type DeleteAccountDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests, and by the caller that
   *  must supply a client allowed to write the two rows named in the docblock. */
  getStore?: (req: PayloadRequest) => Promise<DeletionStore>
}

/** What the deletion screen reports back (T032b) — each number is one of the three outcomes. */
export type ContaExcluida = {
  readonly curtidasRemovidas: number
  readonly conteudosAnonimizados: number
  /** Profiles this login still holds **in this organization**, counted inside the transaction. */
  readonly perfisRestantes: number
  /** Whether the global `users` row went too — false when another lab still holds this login. */
  readonly contaRemovida: boolean
  /** US8: a second request is a no-op that reports the first, rather than an error. */
  readonly jaRemovido: boolean
}

const JA_REMOVIDO: ContaExcluida = {
  curtidasRemovidas: 0,
  conteudosAnonimizados: 0,
  perfisRestantes: 0,
  contaRemovida: false,
  jaRemovido: true,
}

/** A relationship arrives as a raw id or as a populated document depending on depth. */
const idDe = (ref: unknown): string | number | null => {
  if (ref === null || ref === undefined) return null
  if (typeof ref === 'object') {
    const id = (ref as { id?: unknown }).id
    return typeof id === 'string' || typeof id === 'number' ? id : null
  }
  return ref as string | number
}

/** The document a like points at. Polymorphic: `curtida.conteudo` is `{ relationTo, value }`. */
type AlvoCurtida = { collection: string; id: string | number }

type LinhaCurtida = {
  id: string | number
  conteudo?: { relationTo?: string; value?: unknown } | null
}

const alvoDe = (linha: LinhaCurtida): AlvoCurtida | null => {
  const collection = linha.conteudo?.relationTo
  const id = idDe(linha.conteudo?.value)
  return collection && id !== null ? { collection, id } : null
}

/**
 * The clause that finds a document's likes — `conteudo.value`, and **the same string the
 * reconciliation gate recounts with** (`tests/content/counters.test.ts` § `DERIVED_SOURCES`)
 * and that `curtir.ts` writes. A polymorphic relationship is stored as `{ relationTo, value }`,
 * so querying the bare field name raises `QueryError`; and a counter derived from a different
 * clause than the gate recounts with is a counter CI reports as drifted on every write.
 */
const doConteudo = (alvo: AlvoCurtida) => ({ 'conteudo.value': { equals: alvo.id } })

/**
 * Delete this person's likes, then recount every document they touched.
 *
 * The recount runs **after all the deletes**, once per distinct target, and not inline after
 * each one: two rows can point at the same document, and a recount issued between them would
 * write a number that is already wrong by the time the loop ends.
 */
async function removerCurtidas(
  store: DeletionStore,
  req: PayloadRequest,
  conta: string | number,
): Promise<number> {
  const { docs } = await store.find<LinhaCurtida>({
    collection: 'curtida',
    where: { usuario: { equals: conta } },
    limit: TODAS_AS_LINHAS,
    depth: 0,
  })

  const alvos = new Map<string, AlvoCurtida>()
  for (const linha of docs) {
    await store.delete({ collection: 'curtida', id: linha.id })
    const alvo = alvoDe(linha)
    if (alvo) alvos.set(`${alvo.collection}:${String(alvo.id)}`, alvo)
  }

  for (const alvo of alvos.values()) {
    await syncCounter(
      {
        req,
        target: alvo,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: doConteudo(alvo) } },
      },
      // The same client, so the recount is on this transaction and not racing it.
      { getStore: async () => store },
    )
  }

  return docs.length
}

/** Null the byline on everything this profile published — the work itself is untouched. */
async function anonimizarAutoria(
  store: DeletionStore,
  perfilId: string | number,
): Promise<number> {
  let total = 0
  for (const collection of COLECOES_COM_AUTOR) {
    const { docs } = await store.find<{ id: string | number }>({
      collection,
      where: { autor: { equals: perfilId } },
      limit: TODAS_AS_LINHAS,
      depth: 0,
    })
    for (const doc of docs) {
      const atualizado = await store.update({ collection, id: doc.id, data: { autor: null } })

      // The return value is checked, and that is not defensive programming — it is the only
      // thing standing between this function and a silent lie.
      //
      // The choke point's `update` is a **bulk** update underneath (`client.ts`), and Payload's
      // bulk update does not throw on a per-document failure: it collects the error into
      // `result.errors` and returns, so the client hands back `docs?.[0] ?? null`. A refused
      // write therefore arrives here as `null`, not as an exception. The first draft ignored it
      // and incremented anyway — so with `autor` still refused, the profile was deleted, the
      // curtida rows were deleted, the counters were recomputed, three rows kept pointing at a
      // `perfilMaker` id that no longer existed, and the person was told their authorship had
      // been removed. A dangling foreign key and a false LGPD report, reported as success.
      //
      // `syncCounter` in `lib/content/counters.ts` already holds this discipline for the same
      // reason, in its own words: silence on a write that matched no row is the one drift path
      // a transaction cannot catch.
      if (atualizado === null) {
        throw new Error(
          `nao foi possivel remover a autoria de ${collection} #${String(doc.id)}: a atualizacao ` +
            `nao retornou documento. O update em massa do Payload recolhe o erro de validacao em ` +
            `vez de lancar, entao isto e o que impede a exclusao de reportar sucesso deixando a ` +
            `linha apontando para um perfil que acabou de ser apagado (FR-031, CLR-003).`,
        )
      }
      total += 1
    }
  }
  return total
}

/** Profiles this login still holds here. Confined to this organization by the choke point. */
async function contarPerfisRestantes(
  store: DeletionStore,
  conta: string | number,
): Promise<number> {
  const { totalDocs } = await store.find({
    collection: 'perfilMaker',
    where: { usuario: { equals: conta } },
    limit: CONTAGEM_APENAS,
    depth: 0,
  })
  return totalDocs
}

/** Labs other than this one that this login is a member of — read from the global `users` row. */
async function outrosVinculos(store: DeletionStore, conta: string | number): Promise<number> {
  const doc = await store.findByID<{ orgs?: { organization?: unknown; role?: string }[] }>({
    collection: 'users',
    id: conta,
    depth: 0,
  })
  if (!doc) return 0
  return tenantIdsOf(doc).filter((id) => String(id) !== String(store.tenantId)).length
}

/**
 * Erase a maker's account: the personal data, the byline, the likes and the counters (FR-031).
 *
 * @returns what was done, so the confirmation screen can report the three outcomes it promised
 * (FR-031b). A second request for a profile that is already gone returns `jaRemovido` and
 * writes nothing (US8).
 * @throws Error when the profile carries no `usuario` — before any write. The likes are found
 * **by account**, so a profile with no account is one whose likes cannot be identified, and
 * continuing would report an erasure that left them behind.
 * @throws whatever any read or write raises, untouched, so the caller's transaction rolls back.
 *
 * @example
 * // In the deletion screen's server action, which already holds the request:
 * const resultado = await deleteAccount({ req, perfilId: perfil.id })
 */
export async function deleteAccount(
  input: DeleteAccountInput,
  deps: DeleteAccountDeps = {},
): Promise<ContaExcluida> {
  const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req))
  // Once. Every read and write below shares this client, and therefore this transaction.
  const store = await getStore(input.req)

  const perfil = await store.findByID<{ usuario?: unknown }>({
    collection: 'perfilMaker',
    id: input.perfilId,
    depth: 0,
  })
  if (!perfil) return JA_REMOVIDO

  const conta = idDe(perfil.usuario)
  if (conta === null) {
    throw new Error(
      `perfilMaker ${String(input.perfilId)} nao aponta para nenhuma conta: usuario chegou ` +
        `como ${JSON.stringify(perfil.usuario ?? null)}. As curtidas sao encontradas PELA ` +
        `conta (curtida.usuario), entao apagar este perfil deixaria as curtidas para tras e ` +
        `os contadores errados. Nada foi apagado.`,
    )
  }

  const curtidasRemovidas = await removerCurtidas(store, input.req, conta)
  const conteudosAnonimizados = await anonimizarAutoria(store, input.perfilId)
  await store.delete({ collection: 'perfilMaker', id: input.perfilId })

  // Depois do delete, e aqui dentro: ver o docblock para por que a ordem e a decisao.
  const perfisRestantes = await contarPerfisRestantes(store, conta)
  const contaRemovida = perfisRestantes === 0 && (await outrosVinculos(store, conta)) === 0
  if (contaRemovida) await store.delete({ collection: 'users', id: conta })

  return {
    curtidasRemovidas,
    conteudosAnonimizados,
    perfisRestantes,
    contaRemovida,
    jaRemovido: false,
  }
}
