import { REST_POST } from '@payloadcms/next/routes'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'

/**
 * T016 / FR-015, SC-004 — **the per-account login lock, driven against the real one**.
 *
 * SC-004: *"login is rate-limited per account: 5 failures lock it for 10 minutes"*, proved by
 * *"a test driving 6 attempts against the real lock"*.
 *
 * ── What is under test, and where it lives ─────────────────────────────────────────────────
 *
 * Nothing here is ours to build. The lock is Payload's own (`auth/operations/login.js` calling
 * `incrementLoginAttempts`), switched on by `Users.auth.maxLoginAttempts` / `lockTime`, which
 * T011 wrote out as chosen values rather than leaving as inherited defaults. The plan says the
 * work is *"configuration of an object that already exists"* — so this file is a **proof**, and
 * a proof that was never watched failing is indistinguishable from one that asserts nothing.
 * The mutation record is at the bottom of this docblock.
 *
 * Every attempt goes through a real Postgres row: `payload.login` for the classification the
 * assertions turn on, and `REST_POST` — the handler `/api/users/login` is actually mounted on —
 * for the one thing the Local API cannot show, that the public surface issues **no token** to a
 * locked account. Nothing is mocked; there is nothing here to mock.
 *
 * ── Why the refusals are classified by error type ──────────────────────────────────────────
 *
 * "Did not get in" is true of a wrong password and of a lock alike, and a boolean would let this
 * file report the lock working on an account whose password it simply had wrong. Payload raises
 * two distinct errors — `AuthenticationError` for a refused password, `LockedAuth` for an account
 * past the threshold — so each attempt is recorded as the *name* of what refused it
 * (`tests/accounts/reset.test.ts` reads the same distinction, for the same reason).
 *
 * That classification is a fact about this test, **not** about what a visitor sees. FR-014 wants
 * both causes to reach the maker as one neutral message, and `lib/tenancy/session.ts` refuses to
 * branch on any of these errors — that neutrality is T014's subject, asserted in
 * `tests/accounts/login.test.ts`, and this file deliberately says nothing about it.
 *
 * ── The threshold is proved from both sides ────────────────────────────────────────────────
 *
 * "The account would not open" is also what a suite reports when the password was never right,
 * when the account was never created, or when the lock engages on the *first* failure. So §1
 * drives `maxLoginAttempts - 1` failures and then signs in **successfully with the same
 * credentials it is about to be refused for** — the lock is not early, the password is right,
 * the account exists — and only then drives the full count and is refused. Same account, same
 * password, one difference: the number of failures in front of it.
 *
 * ── The bound is CLR-007's, and the gap is recorded rather than closed ─────────────────────
 *
 * FR-015 is **per account** in phase 1, and §3 is what pins that: a second account is untouched
 * while the first is locked. Read positively that is the requirement; read the other way it is
 * the accepted gap — one attempt against each of a thousand addresses trips nothing, because
 * there is no per-source limit in phase 1 (CLR-007). T016b records that beside the configuration
 * where an implementer will meet it.
 *
 * ── Watched failing before it was believed ─────────────────────────────────────────────────
 *
 * These assertions pass the day they are written: the lock is in `node_modules` and the numbers
 * it reads are in `collections/Users.ts` (T011). Neither can be mutated in place — pnpm hardlinks
 * package files into the global store, so editing one edits it for every project on the machine,
 * and rewriting `Users.ts` would be observed by the sibling suites driving the same account
 * configuration concurrently. `login.test.ts` (T014) and `reset.test.ts` (T015) hit the same wall
 * and answered it the same way: mutate a **copy**, run a copy of this suite against it, delete
 * both. The mutation here is applied to the **running instance** — `payload.collections.users
 * .config.auth`, which is the exact object `loginOperation` reads its threshold and its window
 * out of — so no source file is touched at all.
 *
 * Both mutants also **pin `politica()`** to SC-004's numbers, because this file reads its
 * threshold out of the running config and would otherwise follow the mutation — driving 500
 * attempts at a lock that closes on the 500th, and proving nothing. Pinning is the honest
 * direction: the spec is the oracle and the configuration is the thing that may have drifted.
 * §4 is the assertion that catches a drifted *number* directly, and it is non-vacuous by
 * construction — it reads the running instance and compares it against FR-015's own two values —
 * so it is green under both mutants, which pinned the very function it reads.
 *
 * The two mutants, and what each one cost:
 *
 *   1. `maxLoginAttempts` raised to 500, the way an operator "loosening" a noisy lock would —
 *      **4 of 14 red**: the sixth attempt signed in, the public route handed a locked account a
 *      JWT, no `lockUntil` was ever written, and §3 found nothing locked to compare its
 *      neighbour against. The three §1 assertions that run *before* the threshold stayed green,
 *      which is the observation worth keeping: a lock that never closes still refuses every
 *      wrong password, so the refusals are the cheap half and the **sixth attempt with the right
 *      password** is the load-bearing one;
 *   2. `lockTime` cut to 1 second — **1 of 14 red**: the window assertion, alone. The account
 *      still locked, the sixth attempt was still refused, the counter still moved, §3's
 *      neighbour was still unaffected, and the lock still lifted. A ten-minute lock reduced to
 *      one second is a rate limit in name only, and this is the only assertion that notices —
 *      which is why §2 brackets `lockUntil` against the configured window rather than merely
 *      checking that some lock was written.
 */

/** The host the REST request arrives on. `users` is global, so no tenant header is needed. */
const HOST = 'cite.fablab.test'

/** The password that really opens every account below — proved, in §1 and §3, never assumed. */
const SENHA = 't016-senha-correta-123'

/** Wrong passwords, distinct from each other so no assertion can pass by their being equal. */
const SENHA_ERRADA = (n: number): string => `t016-senha-errada-${n}`

/**
 * One account per section, because a refused sign-in is *stateful*: the counter this file drives
 * lives on the row, so two sections sharing an account would lock each other out and the failure
 * would read as "the password stopped working".
 */
const CONTAS = {
  limiar: 't016-limiar@example.com',
  janela: 't016-janela@example.com',
  travada: 't016-travada@example.com',
  intacta: 't016-intacta@example.com',
} as const

/** How an attempt ended: `entrou`, or the name of the error that refused it. */
type Desfecho = 'AuthenticationError' | 'entrou' | 'LockedAuth' | string

/** The lock columns as Postgres holds them, below the field layer that hides them. */
type LinhaDeLock = {
  id: number | string
  lockUntil?: Date | null | string
  loginAttempts?: null | number
}

let payload: Payload

/**
 * The threshold and the window **the running instance reads**, not the ones this file believes.
 *
 * `loginOperation` takes both out of `collection.config.auth`, so that is where they are read
 * from here: a test that retyped `5` would keep passing against a config that no longer says 5,
 * and would then be driving four attempts at a lock that closes on the tenth. §4 is what holds
 * these to the numbers FR-015 actually asks for.
 */
const politica = (): { maxLoginAttempts: number; lockTime: number } => {
  const auth = payload.collections.users?.config.auth
  if (!auth) throw new Error('the running config has no `users` collection to read a lock from')
  return { maxLoginAttempts: auth.maxLoginAttempts, lockTime: auth.lockTime }
}

/**
 * One sign-in attempt through the Local API — the same `loginOperation` the REST route calls.
 *
 * The error's constructor name is returned rather than a boolean: see the docblock. An error
 * Payload does not name (a dead database, say) comes back as its own class name and fails the
 * assertion by being neither `entrou` nor the expected refusal, rather than passing as "refused".
 */
const tentar = async (email: string, password: string): Promise<Desfecho> => {
  try {
    await payload.login({ collection: 'users', data: { email, password } })
    return 'entrou'
  } catch (erro) {
    return (erro as { constructor?: { name?: string } })?.constructor?.name ?? 'erro'
  }
}

/** `vezes` failed attempts in a row, each recorded. */
const falhar = async (email: string, vezes: number): Promise<Desfecho[]> => {
  const desfechos: Desfecho[] = []
  for (let n = 1; n <= vezes; n += 1) desfechos.push(await tentar(email, SENHA_ERRADA(n)))
  return desfechos
}

/** One POST to `/api/users/login`, through the handler `app/(payload)/api/[...slug]` mounts. */
const postarLogin = async (
  email: string,
  password: string,
): Promise<{ status: number; token: unknown }> => {
  const handler = REST_POST(configPromise)
  const request = new Request(`https://${HOST}/api/users/login`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, password }),
  })
  const response = await handler(request, {
    params: Promise.resolve({ slug: ['users', 'login'] }),
  })
  const corpo = (await response.json().catch(() => ({}))) as { token?: unknown }
  return { status: response.status, token: corpo.token }
}

/**
 * The row as Postgres holds it.
 *
 * `payload.db.findOne` rather than `payload.find`: `loginAttempts` and `lockUntil` are hidden
 * base auth fields, and `incrementLoginAttempts` writes them through the database layer too.
 * Reading them any other way would assert against a projection the lock never consults.
 */
const linhaDe = async (email: string): Promise<LinhaDeLock> => {
  const linha = await payload.db.findOne<LinhaDeLock>({
    collection: 'users',
    where: { email: { equals: email } },
  })
  if (!linha) throw new Error(`no account exists for ${email}; the fixture never landed`)
  return linha
}

const instanteDe = (valor: Date | null | string | undefined): null | number =>
  valor === null || valor === undefined ? null : new Date(valor).getTime()

/**
 * Moves a live lock into the past — the same column and the same writer the lock itself uses.
 *
 * Time is moved on the row rather than on the clock: `isUserLocked` compares `lockUntil` against
 * `Date.now()`, so a faked system clock would be testing whether Vitest can lie to `Date` rather
 * than whether Payload lets a lock expire.
 */
const expirarBloqueio = async (email: string): Promise<void> => {
  const linha = await linhaDe(email)
  await payload.db.updateOne({
    collection: 'users',
    id: linha.id,
    data: { lockUntil: new Date(Date.now() - 60_000).toISOString() },
    returning: false,
  })
}

const criarConta = (email: string) =>
  payload.create({
    collection: 'users',
    // `overrideAccess: true` because `Users.access.create` is `masterOnly()`: who may create an
    // account is FR-022's question, and forcing this setup through the guarded path would make a
    // broken guard look like a broken lock.
    data: { email, password: SENHA, role: 'user', orgs: [] } as never,
    overrideAccess: true,
  })

const limpar = () =>
  payload.delete({
    collection: 'users',
    where: { email: { in: Object.values(CONTAS) } },
    overrideAccess: true,
  })

beforeAll(async () => {
  payload = await getPayload({ config: configPromise })
  await limpar()
  for (const email of Object.values(CONTAS)) await criarConta(email)
}, 120_000)

afterAll(async () => {
  if (payload) await limpar()
})

/**
 * §1 — the threshold, from both sides (FR-015, SC-004).
 */
describe('the account closes on the configured attempt and not before (FR-015, SC-004)', () => {
  const observado: {
    antesDoLimiar: Desfecho[]
    aindaAbre: Desfecho
    ateOLimiar: Desfecho[]
    depoisDoLimiar: Desfecho
    pelaRota: { status: number; token: unknown }
  } = {
    antesDoLimiar: [],
    aindaAbre: 'nunca tentado',
    ateOLimiar: [],
    depoisDoLimiar: 'nunca tentado',
    pelaRota: { status: 0, token: undefined },
  }

  beforeAll(async () => {
    const { maxLoginAttempts } = politica()
    const conta = CONTAS.limiar

    // One short of the threshold, then the credentials that are about to be refused.
    observado.antesDoLimiar = await falhar(conta, maxLoginAttempts - 1)
    observado.aindaAbre = await tentar(conta, SENHA)

    // A successful sign-in resets the counter, so this is a full run at the threshold and the
    // attempt after it is the (N+1)th SC-004 asks for.
    observado.ateOLimiar = await falhar(conta, maxLoginAttempts)
    observado.depoisDoLimiar = await tentar(conta, SENHA)
    observado.pelaRota = await postarLogin(conta, SENHA)
  }, 120_000)

  it('refuses every wrong password up to the threshold, as a wrong password', () => {
    const { maxLoginAttempts } = politica()
    // A vacuous pass has a shape here: an empty list satisfies every `every` below it.
    expect(observado.antesDoLimiar).toHaveLength(maxLoginAttempts - 1)
    expect(observado.antesDoLimiar).toEqual(
      Array(maxLoginAttempts - 1).fill('AuthenticationError'),
    )
  })

  it('still opens on the right password one attempt short of the threshold', () => {
    expect(
      observado.aindaAbre,
      'the account would not open one failure short of the lock — so either the lock closes ' +
        'early or this suite never had the right password, and every refusal below proves nothing',
    ).toBe('entrou')
  })

  it('refuses the attempts at the threshold too, and only then locks', () => {
    const { maxLoginAttempts } = politica()
    expect(observado.ateOLimiar).toEqual(Array(maxLoginAttempts).fill('AuthenticationError'))
  })

  it('refuses the next attempt as a lock, with the password that had just worked', () => {
    expect(
      observado.depoisDoLimiar,
      `attempt ${politica().maxLoginAttempts + 1} used the same credentials that signed in ` +
        'above. Anything but a lock here means the failures cost the attacker nothing',
    ).toBe('LockedAuth')
  })

  it('issues no token on the public route while the account is locked', () => {
    expect(observado.pelaRota.token, 'the locked account got a session over HTTP').toBeUndefined()
    expect(observado.pelaRota.status).toBe(401)
  })
})

/**
 * §2 — the window is the configured one, and it ends (FR-015, SC-004).
 */
describe('the lock lasts the configured window and then lifts (FR-015)', () => {
  let bracket: { antes: number; depois: number }
  let lockUntil: null | number
  let tentativas: null | number
  let depoisDeExpirar: Desfecho = 'nunca tentado'
  let linhaFinal: LinhaDeLock

  beforeAll(async () => {
    const { maxLoginAttempts } = politica()
    const antes = Date.now()
    await falhar(CONTAS.janela, maxLoginAttempts)
    const depois = Date.now()
    bracket = { antes, depois }

    const linha = await linhaDe(CONTAS.janela)
    lockUntil = instanteDe(linha.lockUntil)
    tentativas = linha.loginAttempts ?? null

    await expirarBloqueio(CONTAS.janela)
    depoisDeExpirar = await tentar(CONTAS.janela, SENHA)
    linhaFinal = await linhaDe(CONTAS.janela)
  }, 120_000)

  it('counted every failure on the row', () => {
    expect(
      tentativas,
      'the failures never reached the counter, so whatever locked the account was not this file',
    ).toBe(politica().maxLoginAttempts)
  })

  it('locks until exactly the configured window from the failure that closed it', () => {
    const { lockTime } = politica()
    expect(lockUntil, 'no lock was written at all').not.toBeNull()
    // Bracketed against the wall clock either side of the locking attempt rather than given a
    // tolerance: `incrementLoginAttempts` writes `now + lockTime`, and `now` is somewhere in
    // this interval by construction. No slack to tune, and no window but the configured one fits.
    expect(lockUntil).toBeGreaterThanOrEqual(bracket.antes + lockTime)
    expect(lockUntil).toBeLessThanOrEqual(bracket.depois + lockTime)
  })

  it('opens again once the lock is in the past, on the same password it refused', () => {
    expect(
      depoisDeExpirar,
      'the account stayed shut after its lock expired — a ten-minute lock that never lifts is ' +
        'an account disabled by five typos',
    ).toBe('entrou')
  })

  it('clears the counter and the lock on the sign-in that follows', () => {
    expect(linhaFinal.loginAttempts ?? 0).toBe(0)
    expect(instanteDe(linhaFinal.lockUntil)).toBeNull()
  })
})

/**
 * §3 — the lock is per account, which is also the whole of the bound (FR-015, CLR-007).
 */
describe('locking one account leaves every other account usable (FR-015, CLR-007)', () => {
  let travada: Desfecho = 'nunca tentado'
  let intacta: Desfecho = 'nunca tentado'
  let linhaIntacta: LinhaDeLock

  beforeAll(async () => {
    const { maxLoginAttempts } = politica()
    await falhar(CONTAS.travada, maxLoginAttempts)

    // Read while the first account is still locked: an unaffected neighbour proves nothing if
    // the lock it is being compared against had already lifted.
    travada = await tentar(CONTAS.travada, SENHA)
    intacta = await tentar(CONTAS.intacta, SENHA)
    linhaIntacta = await linhaDe(CONTAS.intacta)
  }, 120_000)

  it('really has one account locked to compare against', () => {
    expect(travada).toBe('LockedAuth')
  })

  it('signs the other account in at the same moment', () => {
    expect(
      intacta,
      'an account that never failed a sign-in was refused while another was locked — the limit ' +
        'is not per account, and one maker can shut out every other',
    ).toBe('entrou')
  })

  it('left the other account with no failures counted against it', () => {
    // The other reading of §3, and the reason CLR-007 exists: the counter this file drives is
    // reachable only by attacking ONE address. A single attempt against each of a thousand
    // addresses moves a thousand counters by one and trips nothing — phase 1 does not stop
    // password spraying, and `collections/Users.ts` says so where the numbers are configured.
    expect(linhaIntacta.loginAttempts ?? 0).toBe(0)
    expect(instanteDe(linhaIntacta.lockUntil)).toBeNull()
  })
})

/**
 * §4 — the numbers the sections above drove are the numbers FR-015 asks for.
 */
describe('the configured policy is FR-015 five attempts and ten minutes', () => {
  it('locks on the fifth failure', () => {
    expect(politica().maxLoginAttempts).toBe(5)
  })

  it('locks for ten minutes', () => {
    expect(politica().lockTime).toBe(600_000)
  })
})
