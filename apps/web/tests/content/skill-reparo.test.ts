import type { CollectionAfterChangeHook, CollectionConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `recomputeSkillPanels` is proven against a real database elsewhere
// (`skill-catalogue.test.ts` §3/§4). What this file pins is the **order** of the two halves of
// the repair, and that is only visible from inside: a live reactivation shows the restored
// levels whether the sums ran inside the skill's transaction or after it, and the difference
// between those two is a lock every other writer waits on.
// Both panel writers the hook reaches, because the module is mocked whole: `recomputeSkillPanels`
// is what this file is about, and `assignSkillAtLevelZero` is FR-017's backfill running beside it
// on a reactivation. Leaving the second one out does not narrow the file — vitest refuses the
// import outright, so the whole file would go red on a missing export rather than on the ordering
// it exists to pin. It records the ORDER here for the same reason the repair does: both run after
// the commit, and a backfill that jumped ahead of it would write panels inside the skill's own
// transaction.
vi.mock('../../lib/content/xp', () => ({
  recomputeSkillPanels: vi.fn(async () => 0),
  assignSkillAtLevelZero: vi.fn(async () => 0),
}))

import { Skill } from '../../collections/content/Skill'
import { assignSkillAtLevelZero, recomputeSkillPanels } from '../../lib/content/xp'

/**
 * T035 / FR-016, plan § D4 — **the flag commits first; the repair runs after it.**
 *
 * D4's first draft ran the recompute inside the skill's own write. The review priced that and
 * rejected it: one sum plus one profile update per earner, all while holding the `skill` row's
 * lock, is a transaction whose length grows with the lab and a lock every other writer queues
 * behind. So the write commits, and only then does the repair walk the earners — in pages,
 * bounded by the makers the ledger says earned in this skill, each one its own short write.
 *
 * **Why that is safe here and would not be elsewhere**: neither half touches `xpLedger`. The
 * flag is a display rule (FR-019) and the level is a projection of an append-only table
 * (FR-001), so a repair interrupted halfway is *resumable*, not wrong — re-running it produces
 * the same numbers. FR-016 asks that levels be restored, not that they be restored atomically
 * with the flag, and the reconciliation gate (FR-011) is what notices a repair that never
 * finished.
 *
 * The three properties, each silent if it is lost:
 *
 *   1. **The commit happens before the recompute is even entered.** Asserted as an ordered
 *      log rather than as two independent call counts: both orders call both functions once,
 *      and only the sequence tells them apart.
 *   2. **The request reaching the repair carries no transaction.** This is the property that
 *      actually keeps the lock short — committing and then handing the repair a request still
 *      naming the committed transaction would make every `update` inside it join a session
 *      that no longer exists. It is asserted at the moment of the call, because the field is
 *      mutated in place and reading it afterwards proves nothing about what the repair saw.
 *   3. **It is the caller's own request, minus that transaction** — identity, not shape. The
 *      repair reads and writes through the choke point, which derives the organization from
 *      the request; a freshly built one would repair the wrong lab or none at all.
 *
 * And the negative half: **an edit that does not touch `ativa` commits nothing.** Ending the
 * caller's transaction early is a real cost — everything after it in the same operation loses
 * its rollback — and a rename has no level to repair, so it must not pay it.
 */

const SKILL = 7

type Doc = Record<string, unknown>

/** What the fake request records, in the order it happened. */
type Registro = { ordem: string[]; transacaoNoReparo: unknown; reqNoReparo: unknown }

/**
 * A request shaped like the one an admin's write carries: an open transaction, and the adapter
 * method Payload's own `commitTransaction` utility calls. Nothing else — every assertion about
 * it is either its identity or its `transactionID`.
 */
const criarReq = (registro: Registro): PayloadRequest =>
  ({
    transactionID: 'tx-t035',
    payload: {
      db: {
        commitTransaction: vi.fn(async (id?: unknown) => {
          registro.ordem.push(`commit:${String(id)}`)
        }),
      },
    },
  }) as unknown as PayloadRequest

/**
 * Run every `afterChange` hook the collection declares, the way Payload does — all of them
 * rather than `afterChange[0]`, so a repair appended after some future hook is still seen.
 */
const escrever = async (
  collection: CollectionConfig,
  req: PayloadRequest,
  doc: Doc,
  previousDoc: Doc | undefined,
): Promise<void> => {
  for (const hook of collection.hooks?.afterChange ?? []) {
    await (hook as CollectionAfterChangeHook)({
      collection,
      context: {},
      data: doc,
      doc,
      operation: previousDoc === undefined ? 'create' : 'update',
      previousDoc,
      req,
    } as unknown as Parameters<CollectionAfterChangeHook>[0])
  }
}

const ATIVA: Doc = { id: SKILL, nome: 'Corte a Laser', slug: 'corte-a-laser', ativa: true }
const INATIVA: Doc = { ...ATIVA, ativa: false }

describe('T035 — o reparo corre depois do commit da flag', () => {
  let registro: Registro
  let req: PayloadRequest

  beforeEach(() => {
    registro = { ordem: [], transacaoNoReparo: 'nunca chamado', reqNoReparo: null }
    req = criarReq(registro)

    vi.mocked(recomputeSkillPanels).mockReset()
    vi.mocked(recomputeSkillPanels).mockImplementation(async (recebido: PayloadRequest) => {
      registro.ordem.push('recompute')
      registro.transacaoNoReparo = (recebido as { transactionID?: unknown }).transactionID
      registro.reqNoReparo = recebido
      return 0
    })

    vi.mocked(assignSkillAtLevelZero).mockReset()
    vi.mocked(assignSkillAtLevelZero).mockImplementation(async () => {
      registro.ordem.push('nivel-zero')
      return 0
    })
  })

  it('comita a transação da skill ANTES de entrar no recompute (reativação)', async () => {
    await escrever(Skill, req, ATIVA, INATIVA)

    // O backfill de nível 0 (FR-017) corre ao lado do reparo e DEPOIS do commit, pela mesma
    // razão: escrever painéis dentro da transação da própria skill é o que esta ordem existe
    // para impedir. Ele vem por último porque `assignSkillAtLevelZero` pula quem já tem a
    // linha — rodar antes do reparo daria nível 0 a quem o ledger diz que ganhou.
    expect(registro.ordem).toEqual(['commit:tx-t035', 'recompute', 'nivel-zero'])
    expect(vi.mocked(recomputeSkillPanels).mock.calls[0]?.[1]).toBe(SKILL)
    expect(vi.mocked(assignSkillAtLevelZero).mock.calls[0]?.[1]).toBe(SKILL)
  })

  it('entrega ao reparo uma requisição SEM transação — ele não corre dentro da da skill', async () => {
    await escrever(Skill, req, ATIVA, INATIVA)

    expect(registro.transacaoNoReparo).toBeUndefined()
    // A mesma requisição, menos a transação: o choke point deriva a organização dela.
    expect(registro.reqNoReparo).toBe(req)
  })

  it('a desativação segue a mesma ordem — FR-015 recomputa os mesmos números', async () => {
    await escrever(Skill, req, INATIVA, ATIVA)

    // Sem o backfill: desativar não põe skill nenhuma no painel de ninguém. Se ele corresse
    // aqui, a skill recém-retirada entraria no painel de quem nunca a teve — e FR-019 esconde
    // no render, então ela reapareceria inteira no dia em que fosse reativada.
    expect(registro.ordem).toEqual(['commit:tx-t035', 'recompute'])
  })

  it('uma edição que não mexe em `ativa` não comita nada e não repara nada', async () => {
    await escrever(Skill, req, { ...ATIVA, nome: 'Corte a laser' }, ATIVA)

    expect(registro.ordem).toEqual([])
    expect(req.transactionID).toBe('tx-t035')
  })

  it('a criação não comita nada e não repara nada — FR-017 é quem entra no nível 0', async () => {
    await escrever(Skill, req, ATIVA, undefined)

    expect(registro.ordem).toEqual([])
    expect(req.transactionID).toBe('tx-t035')
  })
})
