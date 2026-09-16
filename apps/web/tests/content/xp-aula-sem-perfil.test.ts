import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The same mock the trigger test uses, for the same reason: what this file pins is the hook's
// **decision** when the bridge resolves nobody, and "credited nothing" is only observable as a
// call that never happened. A live database shows an empty ledger for that case and for a
// dozen unrelated failures alike.
vi.mock('../../lib/content/xp', () => ({
  creditXp: vi.fn(async () => true),
  perfilDoUsuarioNesta: vi.fn(async () => null),
}))

import { ProgressoAula } from '../../collections/content/ProgressoAula'
import { creditXp, perfilDoUsuarioNesta } from '../../lib/content/xp'

/**
 * T024 / US2, plan § D3 — **a completion that resolves no profile is DECIDED, not crashed on.**
 *
 * `progressoAula.usuario` is a row of the global `users` collection; XP belongs to a
 * `perfilMaker`, which is scoped. So a person can hold progress in a lab they never joined —
 * `perfilDoUsuarioNesta` returns `null` for them, and that is a real state rather than a fault.
 *
 * Three properties, and no two of them are the same assertion:
 *
 *   1. **no credit** — nobody in this organization earns for it;
 *   2. **no throw** — the hook is `afterChange` and runs inside the watching write's own
 *      transaction, so a rejection here rolls back a progress row that was entirely correct.
 *      Punishing the watch for the profile's absence is the harsher of the two failures;
 *   3. **one warning** — exactly one, and it has to name the row, because silence is
 *      indistinguishable from a credit that worked. `creditOnApproval`'s missing-author branch
 *      records the same finding for the same reason.
 *
 * The hook is reached **through the collection**, never imported directly: a hook written but
 * not registered passes every direct-call assertion and does nothing in production.
 */

/** A request object with nothing on it: the assertions about it are identity, never contents. */
const REQ = { transactionID: 'tx-t024' } as unknown as PayloadRequest

const USUARIO = 9
const AULA = 12
const CONCLUIDA = '2026-09-15T10:00:00.000Z'

type Doc = Record<string, unknown>

const progresso = (extra: Doc = {}): Doc => ({
  id: 5,
  usuario: USUARIO,
  aula: AULA,
  percentualAssistido: 100,
  ...extra,
})

/** Run every `afterChange` hook the collection declares, the way Payload does. */
const escrever = async (doc: Doc, previousDoc: Doc | undefined): Promise<void> => {
  const hooks = ProgressoAula.hooks?.afterChange ?? []
  if (hooks.length === 0) {
    throw new Error(
      'progressoAula registers no afterChange hook: there is no completion credit to decide ' +
        'the unresolvable case of',
    )
  }
  for (const hook of hooks) {
    await (hook as CollectionAfterChangeHook)({
      collection: ProgressoAula,
      context: {},
      data: doc,
      doc,
      operation: 'update',
      previousDoc,
      req: REQ,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

describe('a completion with no profile in this organization (T024, US2, D3)', () => {
  let avisos: string[]
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(creditXp).mockClear()
    vi.mocked(perfilDoUsuarioNesta).mockClear()
    vi.mocked(creditXp).mockResolvedValue(true)
    // The bridge's documented answer for "this person has no profile here" (`xp.ts`).
    vi.mocked(perfilDoUsuarioNesta).mockResolvedValue(null)
    avisos = []
    warn = vi
      .spyOn(console, 'warn')
      .mockImplementation((...args: unknown[]) => void avisos.push(args.map(String).join(' ')))
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('does not throw — the watch was not wrong and must not roll back', async () => {
    await expect(
      escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 })),
    ).resolves.toBeUndefined()
  })

  it('credits nobody', async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(creditXp).not.toHaveBeenCalled()
  })

  it('warns exactly once, naming the user and the aula', async () => {
    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(avisos).toHaveLength(1)
    // The message has to carry both halves of the unresolved bridge: which account watched and
    // which class, or the line names a state nobody can go and look at.
    expect(avisos[0]).toContain(String(USUARIO))
    expect(avisos[0]).toContain(String(AULA))
  })

  it('warns once per completion and not once per rewatch', async () => {
    const completa = progresso({ concluidaEm: CONCLUIDA })
    await escrever(completa, progresso({ percentualAssistido: 40 }))
    for (let volta = 0; volta < 3; volta += 1) {
      await escrever(progresso({ concluidaEm: CONCLUIDA, posicaoReproducao: volta }), completa)
    }

    expect(avisos).toHaveLength(1)
    expect(creditXp).not.toHaveBeenCalled()
  })

  it('still credits when the profile DOES resolve — the warning is the exception, not the path', async () => {
    vi.mocked(perfilDoUsuarioNesta).mockResolvedValue({ id: 42 })

    await escrever(progresso({ concluidaEm: CONCLUIDA }), progresso({ percentualAssistido: 90 }))

    expect(creditXp).toHaveBeenCalledTimes(1)
    expect(avisos).toEqual([])
  })
})
