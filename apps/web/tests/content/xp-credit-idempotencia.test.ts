import type { PayloadRequest } from 'payload'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  creditXp,
  isDuplicateLedgerEntry,
  XP_LEDGER_UNIQUE_INDEX,
  XP_LEDGER_UNIQUE_VIOLATION,
  type CreditInput,
  type XpStore,
} from '../../lib/content/xp'
import config from '../../payload.config'
import type { CreateArgs, FindArgs, UpdateArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T015 / FR-003, FR-004 — **the duplicate is the SUCCESS path of idempotency, and everything
 * else takes the caller's transaction with it.**
 *
 * The unique index on `xp_ledger.chave_idempotencia` is the guarantee (T011 proved it at the
 * database with a raw `23505`). This file is about the only thing left for application code to
 * get wrong: what `creditXp` *does* with the refusal.
 *
 * Three ways to get it wrong, and one assertion below for each:
 *
 *   1. **Let the duplicate escape.** Rewatching a class, or two reviewers approving the same
 *      submission at the same instant (US3's edge), would then roll back an action that was
 *      perfectly valid — FR-025's no-op becoming a crash.
 *   2. **Swallow everything.** A blanket `catch` turns a dropped connection, a missing
 *      `regrasXp` row or a foreign-key violation into "already credited", and the causing write
 *      commits while the ledger silently has no entry. That is the precise inverse of FR-004.
 *   3. **Recognise the duplicate by the wrong evidence.** 004's T020 measured that
 *      `@payloadcms/drizzle`'s `handleUpsertError` intercepts Postgres's refusal and rethrows a
 *      `ValidationError` in which the SQLSTATE and the index name are **gone** — so a detector
 *      written against the raw `23505` alone never fires, and every duplicate escapes as (1).
 *
 * §1 is unit-level against a named fake: which calls are issued and what happens to the result
 * is a property of this function, and a database demonstrates none of it. §2 is the half a fake
 * cannot answer — it drives a real duplicate through the Local API and asserts the *shape*
 * §1's fixtures claim, so a Payload upgrade that re-encodes the error fails here rather than by
 * silently double-crediting in production (preamble item 2: ask the authority, never a
 * hand-maintained list).
 */

/** A request object with nothing on it: the assertions are about identity, never contents. */
const REQ = { transactionID: 'tx-t015' } as unknown as PayloadRequest

const ENTRADA: Omit<CreditInput, 'req'> = {
  perfil: 42,
  skill: 7,
  acao: 'publicar_artigo',
  refTipo: 'artigo',
  refId: 9,
}

/** The rate this organization is on — deliberately not 1, so a hard-coded 1 is visible. */
const XP_POR_ACAO = 3

/**
 * The rest of the economy row. Not scenery: since T016 a successful credit recomputes the
 * maker's projections in the same call, and `levelFor` needs the curve — an economy row
 * carrying only a rate is refused rather than completed with invented numbers (FR-007, FR-009).
 * The projections themselves are `tests/content/xp-projecoes.test.ts`'s subject, not this
 * file's; here they only have to be able to run.
 */
const REGRAS_COMPLETAS = { xpPorAcao: XP_POR_ACAO, xpPorNivel: 5, nivelMaximo: 10 }

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs). It records every call so the assertions can be about *which*
 * operations were issued, and not merely about the return value.
 */
class FakeXpStore implements XpStore {
  readonly finds: FindArgs[] = []
  readonly creates: CreateArgs[] = []
  /** T016's projection write. Recorded rather than asserted on — see `xp-projecoes.test.ts`. */
  readonly updates: UpdateArgs[] = []

  constructor(
    private readonly behaviour: {
      /** When set, `create` rejects with it — the refusal path under test. */
      createFails?: unknown
      /** The organization's economy row. `null` is an organization that has none. */
      regras?: Record<string, unknown> | null
      /** An entry for this tuple already exists — the FR-003 no-op the module reads for. */
      jaCreditado?: boolean
    } = {},
  ) {}

  /**
   * Answers **per collection**, because `creditXp` now asks two different questions.
   *
   * It used to ask one — the economy — and write the entry blind, catching the duplicate. That
   * shape was measured to be unrecoverable: Payload's `create` calls `killTransaction` on any
   * error, unconditionally and with no savepoint beneath it, so the catch ran over a transaction
   * that was already destroyed. The module reads for the entry first now.
   *
   * A fake that answered both questions with the economy row would report *"already credited"*
   * for every call and never reach `create` at all — which is exactly what this fake did before
   * this change, and why five cases below went red rather than one.
   */
  async find<T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> {
    this.finds.push(args)

    if (args.collection === 'xpLedger') {
      const docs = this.behaviour.jaCreditado ? [{ id: 1 } as T] : []
      return { docs, totalDocs: docs.length }
    }

    const regras = this.behaviour.regras === undefined ? REGRAS_COMPLETAS : this.behaviour.regras
    const docs = regras ? [regras as T] : []
    return { docs, totalDocs: docs.length }
  }

  async create<T = Record<string, unknown>>(args: CreateArgs): Promise<T> {
    this.creates.push(args)
    if (this.behaviour.createFails !== undefined) throw this.behaviour.createFails
    return { id: 1, ...args.data } as T
  }

  async update<T = Record<string, unknown>>(args: UpdateArgs): Promise<T | null> {
    this.updates.push(args)
    return { id: args.id, ...args.data } as T
  }
}

/** What the running stack raises for a duplicate — see `XP_LEDGER_UNIQUE_VIOLATION`. */
const duplicataDoPayload = () =>
  Object.assign(new Error('The following field is invalid: chaveIdempotencia'), {
    data: {
      errors: [
        {
          message: 'Value must be unique',
          path: XP_LEDGER_UNIQUE_VIOLATION.path,
          tableName: XP_LEDGER_UNIQUE_VIOLATION.tableName,
        },
      ],
    },
  })

/** The second door: a raw unique violation, which a direct write still produces. */
const duplicataCrua = () =>
  Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint: XP_LEDGER_UNIQUE_INDEX,
  })

const creditar = (store: FakeXpStore) =>
  creditXp({ req: REQ, ...ENTRADA }, { getStore: async () => store })

describe('§1 — the ledger write, and what a refusal means (FR-003, FR-004)', () => {
  it("writes one xpLedger entry through a client built from the CALLER'S OWN req", async () => {
    const store = new FakeXpStore()
    let recebido: PayloadRequest | undefined

    const escreveu = await creditXp(
      { req: REQ, ...ENTRADA },
      {
        getStore: async (req) => {
          recebido = req
          return store
        },
      },
    )

    // Identity, not equality: Payload joins an operation to an open transaction through
    // `req.transactionID`, so a *copy* of the request — or a fresh one — leaves the credit
    // outside the transaction that caused it and FR-004 is lost with nothing reporting it.
    expect(
      recebido,
      'creditXp built its client from a different request object than the one it was given, ' +
        "so the ledger write is not on the causing write's transaction (FR-004)",
    ).toBe(REQ)
    expect(escreveu).toBe(true)
    expect(store.creates).toHaveLength(1)
    expect(store.creates[0]?.collection).toBe('xpLedger')
    expect(store.creates[0]?.data).toMatchObject({
      perfil: ENTRADA.perfil,
      skill: ENTRADA.skill,
      acao: ENTRADA.acao,
      refTipo: ENTRADA.refTipo,
      refId: ENTRADA.refId,
    })
  })

  it("copies the organization's own xpPorAcao into the entry, never a hard-coded rate", async () => {
    const store = new FakeXpStore()
    await creditar(store)

    expect(
      store.creates[0]?.data.quantidade,
      'the amount was not read from this organization\'s regrasXp row. `quantidade` has no ' +
        'defaultValue on purpose (XpLedger.ts): a credit that invents one records the CITe ' +
        'economy at a lab that retuned its own (FR-009)',
    ).toBe(XP_POR_ACAO)
    expect(store.finds[0]?.collection).toBe('regrasXp')
  })

  it('never composes chaveIdempotencia itself — the collection hook owns the key (FR-003)', async () => {
    const store = new FakeXpStore()
    await creditar(store)

    // `composeIdempotencyKey` OVERWRITES whatever a caller sends, so a key composed here would
    // be discarded — but it would also be a second format nobody maintains, and the index is
    // exactly as sharp as the string written into the column.
    expect(Object.keys(store.creates[0]?.data ?? {})).not.toContain('chaveIdempotencia')
  })

  /**
   * The FR-003 no-op is reached by **reading**, not by catching — and these two cases used to
   * assert the opposite.
   *
   * They read *"treats the duplicate as SUCCESS: returns false and does not throw"*, which was
   * the contract until it was measured. Payload's `create` calls `killTransaction` on any error,
   * **unconditionally**, and `@payloadcms/drizzle` takes no savepoint — so a `catch` here ran
   * over a transaction that was already destroyed, and returning `false` reported success over a
   * rollback that had eaten the caller's approval *and* the first, valid entry.
   *
   * So the no-op moved to a read before the insert, and these cases moved with it.
   */
  it('no-ops on an entry that already exists: returns false, writes nothing (FR-003, SC-001)', async () => {
    const store = new FakeXpStore({ jaCreditado: true })

    await expect(
      creditar(store),
      'the action was already credited and creditXp wrote anyway — FR-003 forbids the second ' +
        'entry, and reaching the insert at all is what puts the caller’s transaction at risk',
    ).resolves.toBe(false)
    expect(
      store.creates,
      'nothing may be written on the no-op path: the whole point of reading first is that the ' +
        'caller’s transaction is never exposed to a constraint violation it cannot recover from',
    ).toEqual([])
  })

  /**
   * What the duplicate detector is for **now**: the race, not the re-approval.
   *
   * Reaching the insert means the read above found nothing and the write still collided, which
   * has exactly one cause — a concurrent credit for the same tuple committed in between (US3's
   * two reviewers). The caller's transaction is already dead, so the error propagates; what
   * `isDuplicateLedgerEntry` buys is that the reviewer who lost is told *that*, rather than a
   * raw `ValidationError` about a column pair.
   */
  it.each([
    ['the ValidationError Payload actually raises', duplicataDoPayload],
    ['the raw 23505 naming this index — the second door (T020)', duplicataCrua],
  ])('names the lost race for %s', async (_que, erro) => {
    const store = new FakeXpStore({ createFails: erro() })

    await expect(
      creditar(store),
      'a duplicate that reaches the INSERT is a lost race, not a no-op — the read found ' +
        'nothing, so another credit committed in between. It must not resolve: the caller’s ' +
        'transaction is already gone and reporting success over it is the defect this shape ' +
        'replaced.',
    ).rejects.toThrow(/crédito concorrente/)
  })

  it("rethrows ANOTHER constraint's violation, untouched (FR-004)", async () => {
    // The shape 004 measured for the handle index: a unique violation that is *not* this one.
    const alheio = Object.assign(new Error('The following field is invalid: handle'), {
      data: { errors: [{ message: 'Value must be unique', path: 'tenant_id, handle', tableName: 'perfil_maker' }] },
    })
    const store = new FakeXpStore({ createFails: alheio })

    await expect(
      creditar(store),
      'a violation of a DIFFERENT constraint was reported as "already credited". The causing ' +
        'write then commits with no ledger entry behind it, which is the inverse of FR-004 ' +
        'and leaves nothing to notice it',
    ).rejects.toBe(alheio)
  })

  it('rethrows a 23505 that names a different index', async () => {
    const outro = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      constraint: 'perfil_maker_tenant_handle_unique_idx',
    })
    const store = new FakeXpStore({ createFails: outro })

    await expect(creditar(store)).rejects.toBe(outro)
  })

  it("rethrows an ordinary failure so it takes the caller's transaction with it (FR-004)", async () => {
    const queda = new Error('Connection terminated unexpectedly')
    const store = new FakeXpStore({ createFails: queda })

    await expect(
      creditar(store),
      'a failed ledger write was swallowed. FR-004 grants XP inside the causing action\'s ' +
        'transaction precisely so that a credit that cannot be written undoes the action — ' +
        'SC-003 asserts the content is still unpublished afterwards',
    ).rejects.toBe(queda)
  })

  it('refuses an organization with no regrasXp row rather than inventing a rate (FR-009)', async () => {
    const store = new FakeXpStore({ regras: null })

    await expect(creditar(store)).rejects.toThrow(/regrasXp/)
    expect(
      store.creates,
      'the credit was written with an amount nobody configured. An entry carrying an invented ' +
        'rate is indistinguishable from a real one afterwards, and every projection derived ' +
        'from it inherits the invention',
    ).toEqual([])
  })
})

/**
 * §2 — **the shape itself, asked of the running stack** (preamble item 2).
 *
 * Everything in §1 is built on `XP_LEDGER_UNIQUE_VIOLATION`. If that constant is wrong, every
 * assertion above still passes — the fixtures and the detector would simply agree with each
 * other — and every duplicate in production escapes as an unhandled error. The only authority
 * on the encoding is `@payloadcms/drizzle`'s `handleUpsertError`, reached here by writing a
 * real duplicate through the Local API.
 *
 * `perfil` and `skill` are left null on purpose: both are nullable (CLR-011), the tuple under
 * test lives entirely in `chave_idempotencia`, and naming real rows would cost this file
 * fixtures to tear down in foreign-key order — which `counters.test.ts`, reconciling the whole
 * database, bills somebody else for.
 */
const SLUG_SENTINELA = 't015-duplicata'

describe('§2 — what a real duplicate looks like to the catch (T020, FR-003)', () => {
  let payload: Payload
  let tenant: string | number
  let erro: unknown

  const limpar = async () => {
    await payload.delete({
      collection: 'xpLedger',
      where: { tenant: { equals: tenant } },
      overrideAccess: true,
    })
    await payload.delete({
      collection: 'organizations',
      where: { slug: { equals: SLUG_SENTINELA } },
      overrideAccess: true,
    })
  }

  beforeAll(async () => {
    payload = await getPayload({ config })
    const org = await payload.create({
      collection: 'organizations',
      data: { name: 'Lab T015', slug: SLUG_SENTINELA, status: 'active' },
      overrideAccess: true,
    })
    tenant = org.id

    const credito = () =>
      payload.create({
        collection: 'xpLedger',
        data: {
          tenant,
          acao: 'publicar_artigo',
          refTipo: 'artigo',
          refId: 9,
          quantidade: XP_POR_ACAO,
        } as never,
        overrideAccess: true,
      })

    await credito()
    try {
      await credito()
    } catch (caught) {
      erro = caught
    }
  }, 120_000)

  afterAll(async () => {
    if (payload) await limpar()
  })

  it('refuses the second credit for the same tuple', () => {
    expect(
      erro,
      'the ledger accepted two entries for the same (tenant, perfil, acao, refTipo, refId). ' +
        'FR-003 is a database guarantee and it is not in force',
    ).toBeDefined()
  })

  it('carries the table and the column pair — and NOT the SQLSTATE (the measurement T015 is built on)', () => {
    const detalhe = (
      erro as { data?: { errors?: { message?: string; path?: string; tableName?: string }[] } }
    )?.data?.errors?.[0]

    expect(
      { tableName: detalhe?.tableName, path: detalhe?.path },
      'the duplicate arrives in a shape XP_LEDGER_UNIQUE_VIOLATION does not describe, so ' +
        'creditXp cannot tell a duplicate apart from any other failed insert. Got: ' +
        JSON.stringify(erro, Object.getOwnPropertyNames(Object(erro))).slice(0, 400),
    ).toEqual({ ...XP_LEDGER_UNIQUE_VIOLATION })
  })

  it('is recognised by isDuplicateLedgerEntry, which is what closes the loop', () => {
    expect(
      isDuplicateLedgerEntry(erro),
      'the detector §1 exercises does not recognise the error the running stack actually ' +
        'raises. Every duplicate credit escapes and rolls back a valid action',
    ).toBe(true)
  })
})
