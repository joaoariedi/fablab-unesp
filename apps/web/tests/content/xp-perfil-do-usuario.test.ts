import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { perfilDoUsuarioNesta, type ReferenciaUsuario } from '../../lib/content/xp'
import type { FindArgs } from '../../lib/tenancy'
import type { PaginatedResult } from '../../lib/tenancy/client'

/**
 * T022 / FR-006, US2, D3 — **the bridge from a global identity to the profile of THIS lab.**
 *
 * `progressoAula` names a row of the global `users` collection; XP belongs to a `perfilMaker`,
 * which is scoped. One login can hold a profile at two labs (CLR-002), so resolving the wrong
 * one would credit lab B for a class watched at lab A — the exact leak US7 forbids, and one no
 * later reader could detect, because the entry it writes is well-formed.
 *
 * Unit-level against a named fake, for the reason `xp-projecoes.test.ts` states: *which*
 * request object reaches the choke point, and *which* query was issued, are properties of this
 * function that a live database cannot demonstrate — a green integration test at a lab where
 * the user has exactly one profile says nothing about which profile was asked for.
 *
 * Four properties, each a silent failure if it is lost:
 *
 *   1. The read goes through the **request-scoped choke point**, built from the **caller's own
 *      `req`** — that is what confines it to this organization (CHK032) and what keeps it on
 *      the transaction the credit will be written in.
 *   2. It matches on **`usuario`**, the global id — not on the profile's own id, which the
 *      caller does not have.
 *   3. **No profile in this organization is `null`, never a throw** (D3): a person may watch a
 *      class at a lab they never joined, and failing there would roll back their progress.
 *   4. **A read that FAILS still throws** (CHK045). If it returned `null` too, an outage would
 *      be indistinguishable from "not a member here", and the completion hook would warn once
 *      and drop every credit in the lab while looking healthy.
 */

/** Identity is the assertion; the contents never are. */
const REQ = { transactionID: 'tx-t022' } as unknown as PayloadRequest

const USUARIO_GLOBAL = 501
/** The profile of THIS lab — the only row the scoped client would ever return. */
const PERFIL_DAQUI = { id: 88, usuario: USUARIO_GLOBAL }

/**
 * A named fake for the choke-point client (`.claude/rules/code-quality.md` — mocks are named
 * classes, not inline stubs).
 *
 * It only serves rows the *scoped* client would serve, which is the point: a profile of another
 * lab is not "filtered out" here, it is unreachable, exactly as the real client makes it. What
 * this fake can still catch is the query that asks the wrong question.
 */
class FakePerfilStore {
  readonly finds: FindArgs[] = []

  constructor(
    private readonly comportamento: {
      /** The rows this organization holds, already confined by the choke point. */
      perfis?: Record<string, unknown>[]
      /** When set, `find` rejects with it — the read-failed path. */
      findFails?: unknown
    } = {},
  ) {}

  async find<T = Record<string, unknown>>(args: FindArgs): Promise<PaginatedResult<T>> {
    this.finds.push(args)
    if (this.comportamento.findFails !== undefined) throw this.comportamento.findFails

    const alvo = (args.where as { usuario?: { equals?: unknown } } | undefined)?.usuario?.equals
    const casadas = (this.comportamento.perfis ?? []).filter(
      (linha) => String(linha.usuario) === String(alvo),
    )
    return { docs: casadas.slice(0, args.limit ?? casadas.length) as T[], totalDocs: casadas.length }
  }
}

const resolver = (store: FakePerfilStore, usuario: ReferenciaUsuario = USUARIO_GLOBAL) =>
  perfilDoUsuarioNesta(REQ, usuario, { getStore: async () => store })

describe('perfilDoUsuarioNesta — a global users id becomes the profile of THIS lab (T022)', () => {
  it("resolves the profile of this organization through the CALLER'S OWN req", async () => {
    const store = new FakePerfilStore({ perfis: [PERFIL_DAQUI] })
    let recebido: PayloadRequest | undefined

    const perfil = await perfilDoUsuarioNesta(REQ, USUARIO_GLOBAL, {
      getStore: async (req) => {
        recebido = req
        return store
      },
    })

    // Identity, not equality: a client built from a different request resolves against a
    // different organization — and, later, outside the transaction the credit belongs to.
    expect(
      recebido,
      'the profile was resolved through a client built from a different request object than ' +
        "the caller's own, so neither the organization nor the transaction is the caller's (D3)",
    ).toBe(REQ)
    expect(perfil?.id).toBe(PERFIL_DAQUI.id)
  })

  it('asks perfilMaker for the row whose usuario is that global id, and only one', async () => {
    const store = new FakePerfilStore({ perfis: [PERFIL_DAQUI] })

    await resolver(store)

    expect(
      store.finds.map((f) => f.collection),
      'the bridge read something other than perfilMaker. The profile of this lab is the only ' +
        'row that answers "who earns here" (FR-006)',
    ).toEqual(['perfilMaker'])
    expect(
      store.finds[0]?.where,
      'the query does not match on `usuario`. A completion names a GLOBAL users id, so a read ' +
        "keyed on the profile's own id resolves nobody — or, worse, somebody else",
    ).toEqual({ usuario: { equals: USUARIO_GLOBAL } })
    expect(store.finds[0]?.limit).toBe(1)
  })

  it('returns null — and does NOT throw — for a user with no profile in this organization', async () => {
    // The row exists globally; it simply belongs to another lab, so the scoped client never
    // serves it. This is the state D3 decided rather than crashed on.
    const store = new FakePerfilStore({ perfis: [{ id: 99, usuario: 777 }] })

    const perfil = await resolver(store)

    expect(
      perfil,
      'a user with progress and no profile here must resolve to nothing. Anything truthy ' +
        'credits a profile that is not theirs (US2, D3)',
    ).toBeNull()
    expect(store.finds.length, 'the read never happened').toBe(1)
  })

  it('throws when the READ fails, so an outage is not read as "not a member here"', async () => {
    const queda = new Error('connection terminated unexpectedly')
    const store = new FakePerfilStore({ findFails: queda })

    // CHK045. Swallowing this returns the same `null` as the case above, and the completion
    // hook then warns and drops every credit in the lab while reporting nothing wrong.
    await expect(resolver(store)).rejects.toBe(queda)
  })

  it('accepts the populated relationship a hook receives, not only a bare id', async () => {
    const store = new FakePerfilStore({ perfis: [PERFIL_DAQUI] })

    // Payload hands an `afterChange` hook `doc.usuario` populated at the collection's depth, so
    // the caller may hold `{ id, email, … }` rather than `501`. Stringifying that object into
    // the query matches nothing and returns `null`, which is indistinguishable from "not a
    // member here" — a silent, permanent loss of every class credit.
    const perfil = await resolver(store, { id: USUARIO_GLOBAL, email: 'maker@cite.unesp.br' })

    expect(
      perfil?.id,
      'a populated `usuario` relationship resolved to nobody. The hook that calls this receives ' +
        'exactly that shape (D3, T023)',
    ).toBe(PERFIL_DAQUI.id)
    expect(store.finds[0]?.where).toEqual({ usuario: { equals: USUARIO_GLOBAL } })
  })
})
