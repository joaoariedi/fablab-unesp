import type { CollectionAfterChangeHook, CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `creditXp` owns the ledger write and is proven against a real database elsewhere
// (`xp-credit-idempotencia.test.ts`, `xp-projecoes.test.ts`). What this file pins is the
// **wiring**: that approving a submission calls it, once, with the action, the ref and — the
// half FR-022 is actually about — the skill **the mission names**. A live credit shows the
// entry it produced; it does not show that the hook chose `concluir_missao` over a copy-pasted
// `publicar_projeto`, or that it read the skill from the mission rather than from the row the
// maker can write. Only the arguments show that, and only a mock shows the arguments.
vi.mock('../../lib/content/xp', () => ({ creditXp: vi.fn(async () => true) }))

// Partial, and never wholesale: `TenantUnresolvedError` must stay the REAL class, because the
// hook's one swallowed failure is `instanceof` that class. A stubbed constructor would make
// the check false for the error it is written about, and the server-side-write branch would
// start rolling back seeds instead of warning about them.
vi.mock('../../lib/tenancy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/tenancy')>()),
  getTenantScopedPayload: vi.fn(),
}))

import { MissaoSubmissao } from '../../collections/content/MissaoSubmissao'
import { creditXp } from '../../lib/content/xp'
import { getTenantScopedPayload, TenantUnresolvedError } from '../../lib/tenancy'

/**
 * T029 / FR-022, SC-012, US3 — **approving a submission credits once, to the skill the mission
 * names, through the same idempotency key.**
 *
 * Four properties, each a silent failure if it is lost:
 *
 *   1. **It fires on the TRANSITION into `aprovada`, never on the state.** A submission stays
 *      approved forever, and the row keeps being written afterwards. A hook that asked only
 *      *"is this row approved?"* would call `creditXp` on every later save — it would not
 *      double-credit, because `creditXp` reads the ledger first (FR-003), but it would make
 *      *"the second approval credits nothing"* a property of somebody else's index rather than
 *      of this hook, and spend an economy read inside every edit.
 *   2. **The skill comes from the MISSION, not from the submission.** FR-022 credits the skill
 *      the mission names, and `missao.skill` is `required` precisely so there is always one.
 *      The submission carries no skill column at all — reading one off the row would credit
 *      whatever a maker could put there.
 *   3. **`concluir_missao` / `missao` / the mission's id** are the action, the ref type and the
 *      ref. That tuple IS the idempotency key (FR-003), so a copy-pasted `publicar_projeto`
 *      would both reconstruct the wrong history and collide with a project's key.
 *   4. **The caller's own `req` reaches `creditXp`**, so the entry joins the approving
 *      transaction (FR-004). Asserted by identity, not by shape.
 */

/** A request object with nothing on it: the assertion about it is identity, never contents. */
const REQ = { transactionID: 'tx-t029' } as unknown as PayloadRequest

const SUBMISSAO = 11
const MISSAO = 7
const MAKER = 42
const SKILL_DA_MISSAO = 3

type Doc = Record<string, unknown>

/** The submission as `afterChange` receives it, in whatever state the caller names. */
const submissao = (status: string, extra: Doc = {}): Doc => ({
  id: SUBMISSAO,
  missao: MISSAO,
  maker: MAKER,
  comprovante: 55,
  status,
  ...extra,
})

/** The choke point, stubbed: the only read the hook makes is the mission it must credit. */
const missaoNoBanco = (skill: unknown): void => {
  const findByID = vi.fn(async () => (skill === undefined ? null : { id: MISSAO, skill }))
  vi.mocked(getTenantScopedPayload).mockResolvedValue({ findByID } as never)
}

/**
 * Run every `afterChange` hook the collection declares, the way Payload does.
 *
 * All of them, rather than the first: asserting against `afterChange[0]` would pass a credit
 * hook appended after an unrelated one, or miss it entirely.
 */
const escrever = async (doc: Doc, previousDoc: Doc): Promise<void> => {
  for (const hook of MissaoSubmissao.hooks?.afterChange ?? []) {
    await (hook as CollectionAfterChangeHook)({
      collection: MissaoSubmissao as CollectionConfig,
      context: {},
      data: doc,
      doc,
      operation: 'update',
      previousDoc,
      req: REQ,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

const creditos = () => vi.mocked(creditXp).mock.calls.map(([entrada]) => entrada)

describe('approving a submission credits the mission\'s skill (T029, FR-022)', () => {
  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
    vi.mocked(getTenantScopedPayload).mockReset()
    missaoNoBanco(SKILL_DA_MISSAO)
  })

  it('registers an afterChange hook at all — one written but never wired credits nothing', () => {
    expect(MissaoSubmissao.hooks?.afterChange ?? []).not.toHaveLength(0)
  })

  it('credits once on enviada → aprovada, naming the mission and its skill', async () => {
    await escrever(submissao('aprovada'), submissao('enviada'))

    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({
      perfil: MAKER,
      skill: SKILL_DA_MISSAO,
      acao: 'concluir_missao',
      refTipo: 'missao',
      refId: MISSAO,
    })
  })

  it('passes the caller\'s own req, so the entry joins the approving transaction (FR-004)', async () => {
    await escrever(submissao('aprovada'), submissao('enviada'))

    expect(creditos()[0]?.req).toBe(REQ)
  })

  it('reads the skill from the mission, never from the submission row', async () => {
    // The row carries a `skill` a maker could have written. The mission names another one, and
    // the mission is the one FR-022 credits.
    await escrever(submissao('aprovada', { skill: 999 }), submissao('enviada'))

    expect(creditos()[0]?.skill).toBe(SKILL_DA_MISSAO)
    expect(vi.mocked(getTenantScopedPayload)).toHaveBeenCalledWith(REQ)
  })

  it('resolves the mission when the relationship arrives populated, not only as an id', async () => {
    await escrever(
      submissao('aprovada', { missao: { id: MISSAO, titulo: 'Desafio Corte Laser' } }),
      submissao('enviada'),
    )

    expect(creditos()[0]).toMatchObject({ refId: MISSAO, skill: SKILL_DA_MISSAO })
  })

  it('credits nothing when a second reviewer approves an already-approved row (SC-012)', async () => {
    await escrever(submissao('aprovada'), submissao('aprovada'))

    expect(creditos()).toHaveLength(0)
  })

  it('credits nothing on a write that never reaches aprovada', async () => {
    await escrever(submissao('enviada'), submissao('enviada'))
    await escrever(submissao('recusada'), submissao('enviada'))
    // CLR-015's reopen: recusada → enviada is the maker editing, not an approval.
    await escrever(submissao('enviada'), submissao('recusada'))

    expect(creditos()).toHaveLength(0)
  })

  it('refuses to credit a mission that names no skill — never a silent skill-less credit', async () => {
    missaoNoBanco(null)

    await expect(escrever(submissao('aprovada'), submissao('enviada'))).rejects.toThrow(/skill/i)
    expect(creditos()).toHaveLength(0)
  })

  it('refuses to credit when the mission is unreadable from this organization', async () => {
    missaoNoBanco(undefined)

    await expect(escrever(submissao('aprovada'), submissao('enviada'))).rejects.toThrow(
      /missao|missão/i,
    )
    expect(creditos()).toHaveLength(0)
  })

  it('warns and credits nothing on a server-side write with no host, instead of rolling it back', async () => {
    vi.mocked(getTenantScopedPayload).mockRejectedValue(new TenantUnresolvedError(null))
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(escrever(submissao('aprovada'), submissao('enviada'))).resolves.toBeUndefined()

    expect(creditos()).toHaveLength(0)
    expect(aviso).toHaveBeenCalled()
    aviso.mockRestore()
  })

  it('propagates any other failure, so the approval rolls back with it (SC-003)', async () => {
    vi.mocked(creditXp).mockRejectedValue(new Error('conexão caiu'))

    await expect(escrever(submissao('aprovada'), submissao('enviada'))).rejects.toThrow(
      'conexão caiu',
    )
  })
})
