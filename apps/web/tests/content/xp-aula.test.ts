import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  PayloadRequest,
} from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The same mock the two sibling completion files use, for the same reason: what FR-027 is about
// is **whose** entry a claim produces and **whether** one is produced at all, and both are only
// observable as the arguments a call carried — or as a call that never happened. A live ledger
// shows the row a credit wrote; it cannot show that the account the payload named never reached
// the bridge, because a correct run and a forged one write rows that look alike.
vi.mock('../../lib/content/xp', () => ({
  creditXp: vi.fn(async () => true),
  perfilDoUsuarioNesta: vi.fn(async () => null),
}))

import { ProgressoAula } from '../../collections/content/ProgressoAula'
import { creditXp, perfilDoUsuarioNesta } from '../../lib/content/xp'

/**
 * T025 / FR-027, US2 — **a class is credited only through a progress row that belongs to the
 * requesting maker; a claim that rides no such row writes no entry.**
 *
 * CLR-008 fixes what "refused" can mean here. v1 **trusts** the claim that a class was watched
 * to the end — no elapsed-time floor, no server-side checkpoints — so a maker POSTing their own
 * row at 100% is not the attack FR-027 names. What is left, and what this file pins, is the two
 * links that make *"a row belonging to the requesting maker"* true at all:
 *
 *   1. **the claim must be a `progressoAula` write with a session behind it** — the door;
 *   2. **the row's account is decided server-side, and the credit follows the row's account** —
 *      so the account the payload names reaches neither the row nor the ledger.
 *
 * Break either link and FR-027 is gone in opposite directions. Without (1) a stranger with no
 * session mints entries for anybody. Without (2) a signed-in maker either grants XP to an
 * account they merely name, or points a row they did not earn at their own profile — both of
 * them XP for a class with no progress row of the claimant's own, which is the sentence FR-027
 * is written as.
 *
 * Idempotency is the *other* half of anti-farm and is not this file's: FR-025 and SC-011 are
 * `xp-aula-conclusao.test.ts`, and the unresolvable profile is `xp-aula-sem-perfil.test.ts`.
 * The two links below are asserted **together**, in one pass through the collection, because
 * separately they are each already true and jointly they are the requirement: the beforeValidate
 * hook decides whose row it is, the afterChange hook decides whose entry it is, and only running
 * both shows that the forged `usuario` is gone by the time the ledger is named.
 *
 * Every hook is reached **through the collection**, never imported directly: a hook written but
 * not registered passes every direct-call assertion and does nothing in production — the lesson
 * `review.test.ts` records for `stampApproval`.
 */

/** The maker making the claim: the session behind the request, and nothing else. */
const REQUISITANTE = 7
/** The account the forged payload names — somebody else entirely. */
const OUTRO = 4242

const AULA = 12
const CONCLUIDA = '2026-09-15T10:00:00.000Z'

/**
 * The bridge's answer, as a named fake rather than a constant: a credit whose `perfil` is a
 * fixed number cannot tell *whose* profile was resolved, which is the only thing FR-027 asks.
 * Profiles are deliberately unlike their users' ids, so a hook that passed the raw `usuario`
 * through as a profile id would be visible rather than accidentally right.
 */
const PERFIS: Record<string, number> = { [REQUISITANTE]: 70, [OUTRO]: 4200 }

const perfilDe = (usuario: unknown): { id: number } | null => {
  const id =
    typeof usuario === 'object' && usuario !== null
      ? (usuario as { id?: unknown }).id
      : usuario
  const perfil = PERFIS[String(id)]
  return perfil === undefined ? null : { id: perfil }
}

/** A request carrying a session, or none. Identity is what the transaction assertions read. */
const pedido = (user?: { id: number }): PayloadRequest =>
  ({ transactionID: 'tx-t025', user }) as unknown as PayloadRequest

type Doc = Record<string, unknown>

/** Invokes an access function exactly as Payload does: whole args, only `req.user` read. */
const decidir = async (operation: 'create' | 'update', user: unknown): Promise<unknown> => {
  const access = ProgressoAula.access?.[operation]
  if (typeof access !== 'function') {
    throw new Error(
      `progressoAula declares no ${operation} access, so it falls back to logged-in and the ` +
        'claim door FR-027 depends on is not this collection\'s to state',
    )
  }
  return access({ req: { user } } as never)
}

/** Run every `beforeValidate` hook the collection declares, the way Payload does. */
const validar = async (
  data: Doc,
  operation: 'create' | 'update',
  req: PayloadRequest,
): Promise<Doc> => {
  const hooks = ProgressoAula.hooks?.beforeValidate ?? []
  if (hooks.length === 0) {
    throw new Error(
      'progressoAula registers no beforeValidate hook: nothing binds the row to the requester, ' +
        'so a signed-in maker can claim a completion — and its XP — for any account they name',
    )
  }
  let atual = data
  for (const hook of hooks) {
    const saida = await (hook as CollectionBeforeValidateHook)({
      collection: ProgressoAula,
      context: {},
      data: atual,
      operation,
      req,
    } as unknown as Parameters<CollectionBeforeValidateHook>[0])
    if (saida) atual = saida as Doc
  }
  return atual
}

/**
 * Run every `afterChange` hook the collection declares — all of them rather than the first, so
 * a credit hook appended after an unrelated one is still reached.
 */
const escrever = async (
  doc: Doc,
  previousDoc: Doc | undefined,
  req: PayloadRequest,
  operation: 'create' | 'update' = 'create',
): Promise<void> => {
  const hooks = ProgressoAula.hooks?.afterChange ?? []
  if (hooks.length === 0) {
    throw new Error(
      'progressoAula registers no afterChange hook: a watched class credits nothing, so FR-027 ' +
        'guards a claim path that grants nothing to anybody',
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
      req,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

/** The whole claim path, end to end: the payload as posted, through both hooks. */
const reivindicar = async (payload: Doc, req: PayloadRequest): Promise<Doc> => {
  const linha = await validar(payload, 'create', req)
  const doc = { id: 5, ...linha }
  await escrever(doc, undefined, req, 'create')
  return doc
}

const creditos = () => vi.mocked(creditXp).mock.calls.map(([entrada]) => entrada)
const usuariosResolvidos = () =>
  vi.mocked(perfilDoUsuarioNesta).mock.calls.map(([, usuario]) => usuario)

/** A completion claim as it arrives from a client: 100%, stamped, naming an account. */
const claim = (usuario: unknown): Doc => ({
  usuario,
  aula: AULA,
  percentualAssistido: 100,
  concluidaEm: CONCLUIDA,
})

beforeEach(() => {
  vi.mocked(creditXp).mockClear()
  vi.mocked(perfilDoUsuarioNesta).mockClear()
  vi.mocked(creditXp).mockResolvedValue(true)
  vi.mocked(perfilDoUsuarioNesta).mockImplementation(async (_req, usuario) => perfilDe(usuario))
})

describe('the claim door: no session, no row, no entry (T025, FR-027)', () => {
  it('refuses an anonymous claim on both writes that could carry one', async () => {
    // A completion claim is either a row posted already complete or an existing row advanced to
    // 100% — `create` and `update`, and there is no third verb that stamps `concluidaEm`. Either
    // one left open to a request with no session is an entry credited to an account nobody
    // authenticated, and the afterChange hook below would never see that it was not earned.
    for (const operation of ['create', 'update'] as const) {
      expect(
        await decidir(operation, undefined),
        `an anonymous request can ${operation} a progress row: a completion can be claimed with ` +
          'no session at all, so there is no "requesting maker" for the row to belong to',
      ).toBe(false)
    }
  })
})

describe('the claim credits the requester, never the account it names (T025, FR-027)', () => {
  it('drops the forged usuario before the ledger is ever named', async () => {
    const doc = await reivindicar(claim(OUTRO), pedido({ id: REQUISITANTE }))

    // The row first: the credit reads the row, so a forged account that survives into the
    // document is a forged account in the entry however careful the hook downstream is.
    expect(
      doc.usuario,
      'the posted payload chose the account: a signed-in maker claims a completion — and its ' +
        'XP — for a class they hold no progress row for, in somebody else\'s name',
    ).toBe(REQUISITANTE)
    expect(usuariosResolvidos()).toEqual([REQUISITANTE])
    expect(creditos()).toHaveLength(1)
    expect(creditos()[0]).toMatchObject({
      perfil: PERFIS[REQUISITANTE],
      acao: 'assistir_aula',
      refTipo: 'aula',
      refId: AULA,
    })
  })

  it('never credits the named account — not one entry, under any profile of theirs', async () => {
    await reivindicar(claim(OUTRO), pedido({ id: REQUISITANTE }))

    expect(usuariosResolvidos()).not.toContain(OUTRO)
    expect(
      creditos().map((entrada) => entrada.perfil),
      'an account the claimant merely named was credited: XP can be granted to a maker who ' +
        'never watched the class and never made a request',
    ).not.toContain(PERFIS[OUTRO])
  })

  it('credits the requester once, not once per account the claim mentions', async () => {
    await reivindicar(claim(OUTRO), pedido({ id: REQUISITANTE }))

    expect(creditos()).toHaveLength(1)
  })
})

describe('the credit follows the row, never the session (T025, FR-027)', () => {
  it('earns for the row\'s own account when a different maker advances it', async () => {
    // The mirror of the case above, and the reason it is a separate assertion: the fix for a
    // forged `usuario` must not be "credit whoever is signed in". `attributeProgressToRequester`
    // is deliberately create-only — an update carries a percentage, not a change of viewer — so
    // on an update the row's account is the authority, and a maker who advances a row that is
    // not theirs hands the XP to its owner rather than collecting it themselves.
    await escrever(
      { id: 5, ...claim(OUTRO) },
      { id: 5, usuario: OUTRO, aula: AULA, percentualAssistido: 40 },
      pedido({ id: REQUISITANTE }),
      'update',
    )

    expect(
      usuariosResolvidos(),
      'the credit was resolved from the session: whoever is signed in collects for a row they ' +
        'do not own, which is XP for a class with no progress row of their own',
    ).toEqual([OUTRO])
    expect(creditos()[0]?.perfil).toBe(PERFIS[OUTRO])
  })

  it('writes no entry for a claimant the bridge resolves to nobody', async () => {
    // A session whose account has no `perfilMaker` in this organization resolves to `null`
    // (D3) — there is no profile for the claim to belong to, so there is nothing to credit and
    // the claim earns nothing rather than earning under some default.
    const DESCONHECIDO = 999
    expect(PERFIS[DESCONHECIDO], 'the fixture gave the stranger a profile').toBeUndefined()

    await reivindicar(claim(DESCONHECIDO), pedido({ id: DESCONHECIDO }))

    expect(creditos()).toEqual([])
  })
})
