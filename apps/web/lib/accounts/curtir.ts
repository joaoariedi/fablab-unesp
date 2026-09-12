import type { PayloadRequest } from 'payload'

import { syncCounter } from '../content/counters'
import { getTenantScopedPayload, type TenantScopedPayload } from '../tenancy'

/**
 * The signed-in half of the heart (FR-026, US7, T028b).
 *
 * T001 shipped the other half: a visitor's press opens the account invitation and **the count
 * does not move** (FR-025). This is the branch that writes. `LikeButton`'s signed-in path is
 * `setEstado(await onCurtir())` — it holds no opinion of its own about the number — so every
 * guarantee FR-026 makes is a property of what this module returns.
 *
 * ── The count is the server's answer, never `anterior + 1` ─────────────────────────────────
 *
 * The returned count comes from {@link syncCounter}'s `count` derivation, which recomputes
 * `curtidas` from the `curtida` rows themselves. Incrementing locally would be right only
 * while nobody else is liking the same row, and wrong forever afterwards: a stored counter
 * drifts (an admin bulk delete, a migration, a manual SQL fix — `counters.ts` names all three),
 * and `count` was chosen over `delta` precisely so that every write re-derives and self-heals.
 * A local `+1` would carry the drift forward instead and write it back as truth.
 *
 * ── A failed write restores the count, in the database and not only on screen ───────────────
 *
 * Nothing here is optimistic, so a failure could simply be thrown — the client's state would
 * stay where it was. It is not thrown, for two reasons. The signed-in branch awaits this value
 * inside an `onClick`, where a rejection is an unhandled one and the heart silently does
 * nothing; and the count the person is looking at may already be stale, so "unchanged" and
 * "restored" are different numbers. Answering with the state **as stored** is the only one of
 * the two that is FR-026's *"the count returns to what it was"*.
 *
 * The compensation ({@link desfazer}) is the half that is easy to leave out. If the row is
 * written and the counter write then fails, the caller's transaction usually rolls both back —
 * a failed statement poisons a Postgres transaction and the commit becomes a rollback. But
 * `syncCounter` also throws `CrossTenantError` when the update simply *matched no row*, and
 * that transaction is perfectly healthy: the like would commit with the counter untouched,
 * which is exactly the silent drift the counter strategy exists to prevent. So the write undoes
 * itself before answering.
 *
 * Undoing a **withdrawal** re-creates the row, which gives it a new `createdAt`. That is
 * accepted rather than hidden: the alternative is a like the person's screen says is still
 * there and the database says is gone, and `curtida` stores nothing else that a new row would
 * lose — the like *is* its pair of relationships (`collections/content/Curtida.ts`).
 *
 * **FR-024/FR-028 hold.** No `payload.*` call and no SQL: the store is the request-scoped
 * choke point, obtained **once** so the row write and the counter write share one client and
 * therefore one transaction — the mechanism `signup.ts` and `counters.ts` both spell out.
 */

/** The slice of the choke-point client this needs — `find`/`findByID`/`update` is exactly
 *  `CounterStore`, so the same client satisfies {@link syncCounter} without a second type. */
export type CurtirStore = Pick<
  TenantScopedPayload,
  'find' | 'findByID' | 'create' | 'update' | 'delete'
>

/** The document being liked. Polymorphic by construction — `curtida.conteudo` is declared
 *  `relationTo: ['projeto']` and gains the other three collections as they land (T038–T040). */
export type CurtidaAlvo = { collection: string; id: string | number }

/**
 * What the heart displays after the press — the shape `LikeButton` replaces its state with,
 * wholesale rather than field by field.
 *
 * `falhou` is not part of that shape and is deliberately optional: the button ignores it, and a
 * caller that wants to say *"não deu, tente de novo"* can, without either of them having to
 * tell a failed write apart from a withdrawal by comparing numbers.
 */
export type EstadoCurtida = {
  readonly curtidas: number
  readonly curtido: boolean
  readonly falhou?: boolean
}

export type CurtirInput = {
  /** The request the press runs under. Its transaction is the one both writes join. */
  req: PayloadRequest
  alvo: CurtidaAlvo
}

export type CurtirDeps = {
  /** Defaults to the request-scoped choke point. Injected by tests. */
  getStore?: (req: PayloadRequest) => Promise<CurtirStore>
}

/** `limit: 1` — the row is wanted, or the fact that there is none. Never a listing. */
const UMA_LINHA = 1

/**
 * The clause that identifies this document among `curtida`'s rows.
 *
 * `conteudo.value`, and **the same string the reconciliation gate recounts with**
 * (`tests/content/counters.test.ts` § `DERIVED_SOURCES.curtidas`). A polymorphic relationship
 * is stored as `{ relationTo, value }`, so querying the bare field name raises
 * `QueryError: The following path cannot be queried`; and a counter derived from a different
 * clause than the gate recounts with is a counter CI reports as drifted on every write.
 */
const doConteudo = (alvo: CurtidaAlvo) => ({ 'conteudo.value': { equals: alvo.id } })

const numeroEm = (doc: Record<string, unknown> | null): number => {
  const armazenado = doc?.curtidas
  return typeof armazenado === 'number' ? armazenado : 0
}

/**
 * The requester, from the session and never from an argument.
 *
 * `attributeLikeToRequester` stamps `usuario` on the way in, so this id does not decide
 * attribution — it decides **whose** like is looked up. Reading it from a parameter would make
 * the heart show as pressed for anyone who could name another maker's account.
 *
 * @throws Error when there is no session. The visitor's press is FR-025's invitation and never
 * reaches this function; `curtida`'s `create: scopedAccess()` refuses it a second time.
 */
function idDoRequisitante(req: PayloadRequest): string | number {
  const id = (req?.user as { id?: string | number } | undefined)?.id
  if (id === undefined || id === null) {
    throw new Error(
      `curtir exige sessão: req.user chegou como ${JSON.stringify(req?.user ?? null)}. ` +
        `A curtida anônima não existe (FR-017) — o coração de quem não entrou abre o convite ` +
        `ao cadastro (FR-025) e não escreve linha nenhuma.`,
    )
  }
  return id
}

/** Where the count returns to if anything fails: the stored column and this person's own row. */
type EstadoAnterior = { curtidas: number; linhaId: string | number | null }

async function estadoArmazenado(
  store: CurtirStore,
  alvo: CurtidaAlvo,
  usuario: string | number,
): Promise<EstadoAnterior> {
  const minha = await store.find<{ id: string | number }>({
    collection: 'curtida',
    where: { usuario: { equals: usuario }, ...doConteudo(alvo) },
    limit: UMA_LINHA,
    depth: 0,
  })
  const alvoDoc = await store.findByID<Record<string, unknown>>({
    collection: alvo.collection,
    id: alvo.id,
    depth: 0,
  })
  return { curtidas: numeroEm(alvoDoc), linhaId: minha.docs[0]?.id ?? null }
}

/** The like as a row: the pair of relationships, and nothing else (`Curtida.ts`). */
const linhaDe = (alvo: CurtidaAlvo, usuario: string | number): Record<string, unknown> => ({
  usuario,
  conteudo: { relationTo: alvo.collection, value: alvo.id },
})

/** The write, and the way back out of it — see the module docblock for why there is one. */
type Escrita = { curtido: boolean; desfazer: () => Promise<unknown> }

async function alternarLinha(
  store: CurtirStore,
  alvo: CurtidaAlvo,
  usuario: string | number,
  anterior: EstadoAnterior,
): Promise<Escrita> {
  if (anterior.linhaId !== null) {
    const id = anterior.linhaId
    await store.delete({ collection: 'curtida', id })
    return {
      curtido: false,
      desfazer: () => store.create({ collection: 'curtida', data: linhaDe(alvo, usuario) }),
    }
  }

  const nova = await store.create<{ id: string | number }>({
    collection: 'curtida',
    data: linhaDe(alvo, usuario),
  })
  return {
    curtido: true,
    desfazer: () => store.delete({ collection: 'curtida', id: nova.id }),
  }
}

/**
 * Record — or withdraw — this maker's like, and answer with the state to display (FR-026).
 *
 * @returns the count **derived from the rows** and whether this person's like now exists. On a
 * failure: the state as stored before the press, with `falhou`, and nothing left written.
 * @throws Error when the request carries no session — before any read or write.
 *
 * @example
 * // In the server action a page hands to LikeButton's `onCurtir`:
 * const estado = await alternarCurtida({ req, alvo: { collection: 'projeto', id } })
 */
export async function alternarCurtida(
  input: CurtirInput,
  deps: CurtirDeps = {},
): Promise<EstadoCurtida> {
  const usuario = idDoRequisitante(input.req)
  const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req))
  // Once. Both writes below share this client, and therefore this transaction.
  const store = await getStore(input.req)
  const anterior = await estadoArmazenado(store, input.alvo, usuario)

  let escrita: Escrita | null = null
  try {
    escrita = await alternarLinha(store, input.alvo, usuario, anterior)
    const curtidas = await syncCounter(
      {
        req: input.req,
        target: input.alvo,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: doConteudo(input.alvo) } },
      },
      { getStore: async () => store },
    )
    return { curtidas, curtido: escrita.curtido }
  } catch {
    // Best effort, and its own failure is swallowed on purpose: the transaction rollback is
    // the other guard, and a compensation that throws here would replace a restored count with
    // an unhandled rejection in the click handler.
    await escrita?.desfazer().catch(() => undefined)
    return { curtidas: anterior.curtidas, curtido: anterior.linhaId !== null, falhou: true }
  }
}
