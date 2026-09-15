import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `creditXp` and `perfilDoUsuarioNesta` are each proven against a real database elsewhere
// (`xp-credit-idempotencia.test.ts`, `xp-perfil-do-usuario.test.ts`). What this file pins is
// the **completion hook's trigger**: on which writes it credits and on which it must not. A
// live credit shows the entry it produced; only a mock shows that a rewatch called nothing at
// all — and "credited nothing" and "credited a duplicate the index refused" look identical in
// the database while being opposite behaviours in the code.
vi.mock('../../lib/content/xp', () => ({
  creditXp: vi.fn(async () => true),
  perfilDoUsuarioNesta: vi.fn(async () => ({ id: 42 })),
}))

import { ProgressoAula } from '../../collections/content/ProgressoAula'
import { creditXp, perfilDoUsuarioNesta } from '../../lib/content/xp'
import { TenantUnresolvedError } from '../../lib/tenancy/errors'

/**
 * T023 / FR-025, SC-011 — **the completion credit fires on the transition, never on the
 * state.**
 *
 * `concluidaEm` is stamped when the class reaches 100% (round 5, 2026-08-24), and it is the
 * artifact that credits a watched class (CLR-001). The hook that reads it therefore has to
 * distinguish *newly stamped* from *already set*: a progress row keeps being written after
 * completion — `posicaoReproducao` moves on every rewatch, `percentualAssistido` is rewritten
 * — and a hook keyed on "the row is complete" would call `creditXp` on every one of those
 * writes.
 *
 * That would not double-credit, because the unique index on `chaveIdempotencia` is the arbiter
 * (FR-003) — but it is not merely wasteful: since the measurement recorded in `xp.ts`,
 * `creditXp` **reads first** and returns `false` for an already-credited action, so every
 * rewatch would spend a ledger query and an economy read inside the viewer's own write. The
 * transition guard is what makes "credits nothing, however many times it is rewatched"
 * (SC-011) a property of this hook rather than a consequence of somebody else's index.
 *
 * The hook is reached **through the collection**, never imported directly: a hook that is
 * written but never registered passes every direct-call assertion and does nothing in
 * production — the lesson `review.test.ts` records for `stampApproval`.
 */

/** A request object with nothing on it: the assertion about it is identity, never contents. */
const REQ = { transactionID: 'tx-t023' } as unknown as PayloadRequest

const USUARIO = 9
const AULA = 12
const PERFIL = 42

type Doc = Record<string, unknown>

/** A progress row as `afterChange` receives it at `depth: 0`. */
const progresso = (extra: Doc = {}): Doc => ({
  id: 5,
  usuario: USUARIO,
  aula: AULA,
  percentualAssistido: 100,
  ...extra,
})

const CONCLUIDA = '2026-09-15T10:00:00.000Z'

/**
 * Run every `afterChange` hook the collection declares, the way Payload does.
 *
 * All of them rather than the first: asserting against `afterChange[0]` would pass a credit
 * hook appended after an unrelated one, or miss it entirely.
 */
const escrever = async (
  doc: Doc,
  previousDoc: Doc | undefined,
  operation: 'create' | 'update' = 'update',
): Promise<void> => {
  const hooks = ProgressoAula.hooks?.afterChange ?? []
  if (hooks.length === 0) {
    throw new Error(
      'progressoAula registers no afterChange hook: a class watched to 100% credits nothing, ' +
        'so FR-025 has no mechanism at all',
    )
  }
  for (const hook of hooks) {
    await (hook as CollectionAfterChangeHook)({
      collection: ProgressoAula,
      context: {},
      data: doc,
      doc,
      operation,
      previousDoc,
      req: REQ,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

const creditos = () => vi.mocked(creditXp).mock.calls.map(([entrada]) => entrada)

describe('the class completion credits on the transition (T023, FR-025, SC-011)', () => {
  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(perfilDoUsuarioNesta).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
    vi.mocked(perfilDoUsuarioNesta).mockResolvedValue({ id: PERFIL })
  })

  it('credits once when concluidaEm is newly stamped', async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({
      perfil: PERFIL,
      acao: 'assistir_aula',
      refTipo: 'aula',
      refId: AULA,
    })
  })

  it("passes the completing write's own req, by identity — the entry joins its transaction", async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(creditos()[0]?.req).toBe(REQ)
  })

  it('resolves the profile from the row\'s usuario, not from the session', async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(vi.mocked(perfilDoUsuarioNesta).mock.calls[0]?.[1]).toBe(USUARIO)
  })

  it('credits nothing when concluidaEm was already set — a rewatch', async () => {
    await escrever(
      progresso({ concluidaEm: CONCLUIDA, posicaoReproducao: 30 }),
      progresso({ concluidaEm: CONCLUIDA, posicaoReproducao: 0 }),
    )

    expect(creditos()).toEqual([])
  })

  it('credits nothing however many times the class is rewatched (SC-011)', async () => {
    const completa = progresso({ concluidaEm: CONCLUIDA })
    await escrever(completa, progresso({ percentualAssistido: 40 }))
    for (let volta = 0; volta < 5; volta += 1) {
      await escrever(progresso({ concluidaEm: CONCLUIDA, posicaoReproducao: volta }), completa)
    }

    expect(creditos()).toHaveLength(1)
  })

  it('credits nothing for a row still in progress', async () => {
    await escrever(progresso({ percentualAssistido: 90 }), progresso({ percentualAssistido: 10 }))

    expect(creditos()).toEqual([])
    // Not even the profile lookup: an incomplete row has no credit to resolve anybody for, and
    // a read per player heartbeat is a read nobody asked for.
    expect(vi.mocked(perfilDoUsuarioNesta)).not.toHaveBeenCalled()
  })

  it('credits a create that arrives already complete — there is no earlier row', async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), undefined, 'create')

    expect(creditos()).toHaveLength(1)
  })
})

/**
 * The hook's two remaining branches — both of which decide, on their own, whether a write
 * survives.
 *
 * They are here rather than in the integration file because neither is reachable through a
 * well-formed request: a completion with a non-numeric `aula` cannot be written past the
 * collection's own `relationship` field, and a Local API write with no host is refused before
 * any row exists to assert against. What a live database can show is the outcome; what these
 * show is *which* of the two failures happened, and they are opposite ones — `throw` takes the
 * viewer's progress row with it, `swallow` keeps it.
 */
describe('the two failures the hook decides between (T023, T024, FR-004)', () => {
  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(perfilDoUsuarioNesta).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
    vi.mocked(perfilDoUsuarioNesta).mockResolvedValue({ id: PERFIL })
  })

  it('throws on a non-numeric aula rather than composing a key that matches nothing', async () => {
    // `refId` is half of `chaveIdempotencia`. A key composed from `NaN` matches no earlier
    // entry, so the class would credit again on **every** completion — the one failure the
    // unique index cannot catch, because each key is genuinely distinct. Louder here than in a
    // ledger nobody can reconcile.
    await expect(
      escrever(
        { id: 5, usuario: USUARIO, aula: 'aula-doze', concluidaEm: CONCLUIDA },
        progresso({ percentualAssistido: 90 }),
      ),
    ).rejects.toThrow(/non-numeric aula/)

    expect(
      creditos(),
      'the hook credited before it refused, so the entry it wrote carries the unusable refId ' +
        'the throw exists to prevent',
    ).toEqual([])
  })

  it('swallows TenantUnresolvedError — a server-side write keeps its progress row', async () => {
    // A seed, a migration and the tenancy fixtures all write this collection through the Local
    // API with no host, and the choke point quite correctly refuses to guess an organization
    // there. Letting the refusal out of an `afterChange` hook rolls back a row nobody did
    // anything wrong to write — measured on `creditOnApproval` in `Projeto.ts`.
    vi.mocked(perfilDoUsuarioNesta).mockRejectedValue(
      new TenantUnresolvedError('No host on the request'),
    )

    await expect(
      escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 })),
    ).resolves.toBeUndefined()
  })

  it('lets every OTHER failure through, so the completion rolls back with it', async () => {
    // The other half of the pair, and the one that makes the swallow above narrow rather than
    // blanket: a dropped connection or a missing economy must take the completing write with
    // it (FR-004, SC-003), because a progress row stamped complete with no ledger entry behind
    // it is drift nothing repairs at runtime (CLR-014).
    vi.mocked(creditXp).mockRejectedValue(new Error('connection terminated'))

    await expect(
      escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 })),
    ).rejects.toThrow('connection terminated')
  })
})
