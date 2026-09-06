import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { syncCounter, type CounterStore } from '../../lib/content/counters'
import type { ByIDArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T030 / FR-020 — the **one** counter strategy: stored, and maintained inside the same
 * transaction as the write that caused it.
 *
 * Two failures are being designed against, and every assertion below belongs to one of them:
 *
 *   1. **Counting on read** is an N+1 across exactly the card grids this design serves — a
 *      `SELECT count(*)` per card, per page. So the derived value must be *written to the
 *      target document*, not computed when someone lists it.
 *   2. **A counter maintained outside the causing transaction drifts on every failure.** If
 *      the like commits and the recount does not, `curtidas` is wrong forever and nothing
 *      reports it. Payload joins an operation to an open transaction through
 *      `req.transactionID`, so the mechanism is: the *same* `req` reaches the choke point,
 *      the write is awaited, and a failure propagates instead of being swallowed.
 *
 * Unit-level, against a named fake rather than Postgres: the property under test is which
 * request object reaches the client and what happens to the result, and a live database can
 * demonstrate neither. T031's reconciliation test is the integration half — it recomputes
 * every counter from its source rows against a real database, and is the stated mitigation
 * for the drift a stored counter always has (an admin bulk delete, a migration, manual SQL).
 */

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs). It records every operation so the assertions can be about
 * *which* calls were issued, not merely about the return value.
 */
class FakeCounterStore implements CounterStore {
  readonly finds: FindArgs[] = []
  readonly reads: ByIDArgs[] = []
  readonly writes: UpdateArgs[] = []

  constructor(
    private readonly behaviour: {
      /** What a source-row count returns. Deliberately unrelated to `docs.length`. */
      totalDocs?: number
      /** The target document as currently stored. */
      stored?: Record<string, unknown> | null
      /** When set, `update` rejects with it — the transaction-rollback path. */
      updateFails?: Error
      /** When set, `update` resolves only once this is called. */
      gate?: { release: () => void; wait: Promise<void> }
      /** When true, `update` matches no row — a foreign or deleted target. */
      updateMissed?: boolean
    } = {},
  ) {}

  find = async <T>(args: FindArgs): Promise<PaginatedResult<T>> => {
    this.finds.push(args)
    // `docs` is EMPTY while `totalDocs` is not: an implementation that counts `docs.length`
    // reads 0 here and fails, which is the point. Counting rows must not load them.
    return { docs: [] as T[], totalDocs: this.behaviour.totalDocs ?? 0 }
  }

  findByID = async <T>(args: ByIDArgs): Promise<T | null> => {
    this.reads.push(args)
    return (this.behaviour.stored as T) ?? null
  }

  update = async <T>(args: UpdateArgs): Promise<T | null> => {
    if (this.behaviour.gate) await this.behaviour.gate.wait
    if (this.behaviour.updateFails) throw this.behaviour.updateFails
    this.writes.push(args)
    if (this.behaviour.updateMissed) return null
    return { ...this.behaviour.stored, ...args.data } as T
  }
}

/**
 * The request the causing write is running under. `transactionID` is the whole point: it is
 * what Payload uses to join an operation to an already-open transaction.
 */
const causingWrite = (): PayloadRequest =>
  ({
    transactionID: 'tx-the-like-is-running-in',
    headers: new Headers({ host: 'cite.fablab.test' }),
  }) as unknown as PayloadRequest

const PROJETO_7 = { collection: 'projeto', id: 7 } as const

describe('syncCounter stores the derived value (T030, FR-020)', () => {
  it('writes the recounted total onto the target document instead of counting on read', async () => {
    const store = new FakeCounterStore({ totalDocs: 3 })

    const value = await syncCounter(
      {
        req: causingWrite(),
        target: PROJETO_7,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: { alvo: { equals: 7 } } } },
      },
      { getStore: async () => store },
    )

    expect(value).toBe(3)
    expect(
      store.writes,
      'the recount was not persisted: with nothing stored, every card grid pays a count query ' +
        'per card (FR-020), which is the N+1 this strategy exists to delete',
    ).toEqual([{ collection: 'projeto', id: 7, data: { curtidas: 3 } }])
  })

  it('counts the source rows without loading them', async () => {
    const store = new FakeCounterStore({ totalDocs: 3 })

    await syncCounter(
      {
        req: causingWrite(),
        target: PROJETO_7,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: { alvo: { equals: 7 } } } },
      },
      { getStore: async () => store },
    )

    expect(store.finds).toHaveLength(1)
    expect(store.finds[0]?.collection).toBe('curtida')
    expect(store.finds[0]?.where).toEqual({ alvo: { equals: 7 } })
    expect(
      store.finds[0]?.limit,
      'the count fetched rows as well as counting them; a popular project would pull every ' +
        'curtida row into memory to write a single integer',
    ).toBe(1)
  })

  it('adds a delta to the stored value for a counter with no source rows', async () => {
    // `downloads` has nothing to recount from — there is no row per download — so the same
    // entry point carries the increment. One strategy, two derivations (plan § Sketch 7).
    const store = new FakeCounterStore({ stored: { id: 7, downloads: 41 } })

    const value = await syncCounter(
      {
        req: causingWrite(),
        target: PROJETO_7,
        field: 'downloads',
        derive: { kind: 'delta', by: 1 },
      },
      { getStore: async () => store },
    )

    expect(value).toBe(42)
    expect(store.writes).toEqual([{ collection: 'projeto', id: 7, data: { downloads: 42 } }])
  })

  it('clamps a delta at zero rather than writing a negative counter', async () => {
    // An unlike arriving twice, or against a counter already reconciled to 0. The field
    // declares `min: 0`, so a -1 would be rejected by Payload and roll back the unlike
    // itself — the counter's own defect becoming the user's failed action.
    const store = new FakeCounterStore({ stored: { id: 7, curtidas: 0 } })

    const value = await syncCounter(
      {
        req: causingWrite(),
        target: PROJETO_7,
        field: 'curtidas',
        derive: { kind: 'delta', by: -1 },
      },
      { getStore: async () => store },
    )

    expect(value).toBe(0)
    expect(store.writes).toEqual([{ collection: 'projeto', id: 7, data: { curtidas: 0 } }])
  })
})

describe('syncCounter runs inside the causing transaction (T030, FR-020)', () => {
  it('hands the choke point the SAME request, so the write joins its open transaction', async () => {
    const req = causingWrite()
    const store = new FakeCounterStore({ totalDocs: 1 })
    const seen: PayloadRequest[] = []

    await syncCounter(
      {
        req,
        target: PROJETO_7,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: {} } },
      },
      {
        getStore: async (forRequest) => {
          seen.push(forRequest)
          return store
        },
      },
    )

    expect(
      seen[0],
      'a different request object reached the client, so the counter write opens its own ' +
        'transaction: the like can commit while the recount rolls back, and the counter is ' +
        'then wrong with nothing reporting it (FR-020)',
    ).toBe(req)
    expect(req.transactionID, 'the causing transaction was replaced or cleared').toBe(
      'tx-the-like-is-running-in',
    )
  })

  it('does not resolve until the counter write has landed', async () => {
    // Fire-and-forget is the shape that looks correct and drifts: the hook returns, the
    // transaction commits, and the counter write is still in flight against a connection
    // that is about to be released.
    let release!: () => void
    const wait = new Promise<void>((resolve) => {
      release = resolve
    })
    const store = new FakeCounterStore({ totalDocs: 2, gate: { release, wait } })

    let settled = false
    const pending = syncCounter(
      {
        req: causingWrite(),
        target: PROJETO_7,
        field: 'curtidas',
        derive: { kind: 'count', source: { collection: 'curtida', where: {} } },
      },
      { getStore: async () => store },
    ).then((value) => {
      settled = true
      return value
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled, 'syncCounter resolved before its write completed — fire-and-forget').toBe(false)
    expect(store.writes).toHaveLength(0)

    release()
    expect(await pending).toBe(2)
    expect(store.writes).toHaveLength(1)
  })

  it('propagates a write failure so the causing transaction rolls back', async () => {
    const boom = new Error('deadlock detected')
    const store = new FakeCounterStore({ totalDocs: 5, updateFails: boom })

    await expect(
      syncCounter(
        {
          req: causingWrite(),
          target: PROJETO_7,
          field: 'curtidas',
          derive: { kind: 'count', source: { collection: 'curtida', where: {} } },
        },
        { getStore: async () => store },
      ),
      'the failure was swallowed: the like commits, the counter does not, and the two ' +
        'disagree permanently — a caught error here is silent drift by construction',
    ).rejects.toThrow(boom)
  })

  it('refuses a target the tenant does not own instead of reporting a phantom write', async () => {
    // The choke point constrains `update` by tenant, so a foreign or deleted target matches
    // zero rows and returns null. Treating that as success is the drift path again, arriving
    // through the one direction the transaction cannot protect: nothing failed.
    const store = new FakeCounterStore({ totalDocs: 4, stored: { id: 7 }, updateMissed: true })

    await expect(
      syncCounter(
        {
          req: causingWrite(),
          target: PROJETO_7,
          field: 'curtidas',
          derive: { kind: 'count', source: { collection: 'curtida', where: {} } },
        },
        { getStore: async () => store },
      ),
    ).rejects.toThrow(/projeto/)
  })
})
