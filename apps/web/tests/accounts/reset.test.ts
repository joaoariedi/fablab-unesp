import { REST_POST } from '@payloadcms/next/routes'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'

/**
 * T015 / FR-017, SC-003, US4 — **the password reset, end to end**, against a real database and
 * through the real REST route handler.
 *
 * SC-003: *"a reset token cannot be reused, an expired one is refused, and both addresses get
 * the same body and status"*.
 *
 * ── What is under test, and where it lives ─────────────────────────────────────────────────
 *
 * The reset flow is Payload's own (`/api/users/forgot-password`, `/api/users/reset-password`,
 * mounted by `app/(payload)/api/[...slug]/route.ts`), configured by `Users.auth.forgotPassword`.
 * The plan says so in as many words: *"the work is asserting it, not building it"*. That makes
 * this file a **proof**, and a proof that was never watched failing is indistinguishable from
 * one that asserts nothing — see the mutation record at the bottom of this docblock.
 *
 * Every request goes through `REST_POST(config)` with a real `Request`, the way
 * `tests/tenancy/isolation.test.ts` drives the same surface: the route handler, Payload's own
 * endpoint, the operation, Postgres. Nothing is mocked — this file has no Next request scope to
 * fake, because the REST handler builds its `PayloadRequest` from the `Request` it is given.
 *
 * ── What stands in for "the same body and status" (FR-017) ─────────────────────────────────
 *
 * The response is compared **whole**: status, the body as text (bytes, not a parsed object), and
 * the `content-type`. A refusal that named the cause in a different message would differ in the
 * second; one that answered 404 for an unknown address would differ in the first; one that only
 * switched `content-type` would differ in the third.
 *
 * The reference answer is the **address that has no account**: it leaks nothing by construction,
 * because there is nothing behind it to leak. Stated that way round, the assertion cannot be
 * satisfied by both answers drifting together into something that names a registered address.
 *
 * **The non-vacuity half is not optional.** "Both addresses answered identically" is exactly what
 * a suite reports when the account was never created, or when the database is empty — the
 * registered case is then a second unknown address and the file compares two copies of one
 * answer. So §1 also proves the two branches did *measurably different work*: the registered one
 * wrote a token with a future expiry, the unknown one left no row at all. Different work, one
 * answer, is the whole of FR-017.
 *
 * ── Timing is deliberately not asserted (SC-003) ───────────────────────────────────────────
 *
 * The registered branch writes a row and hands an e-mail to the adapter; the unregistered one
 * returns immediately. A timing oracle therefore exists, and SC-003 records the decision to
 * accept it: *"equalising it costs a dummy delay; asserting it costs a flaky test"*. There is no
 * duration in this file, and adding one would be a change to the spec first.
 *
 * ── Watched failing before it was believed ─────────────────────────────────────────────────
 *
 * These assertions pass the day they are written, because Payload's endpoint already fails
 * silently for an unknown address and `Users.auth.forgotPassword.expiration` already carries
 * FR-017's window (T011). The behaviour under test is therefore in `node_modules` and in
 * configuration, and neither can be mutated in place: pnpm hardlinks package files into the
 * global store, so editing one would edit it for every project on the machine, and rewriting
 * `collections/Users.ts` would be observed by the sibling suites driving the same account
 * config concurrently. `tests/accounts/login.test.ts` hit the same wall at T014 and answered it
 * the same way — mutate a **copy**, run a copy of the suite against it, delete both:
 *
 *   1. the unknown address answered `404 {"errors":[{"message":"No user with that email."}]}`
 *      instead of the silent success — **2 of 14 red**: the status and the byte comparison. The
 *      **content-type comparison stayed green**, because a Payload error body is `application/json`
 *      too. That is the observation worth keeping: a leak does not have to change the shape of the
 *      answer, so the byte comparison is the load-bearing assertion and the other two are the
 *      cheap ways a cruder leak would be caught;
 *   2. the token was left usable after a successful reset (its row put back, as an implementation
 *      that never burns the token would leave it) — **3 of 14 red** in §2: the second use answered
 *      200, the password from that second attempt opened the account, and the password set by the
 *      first no longer did;
 *   3. `resetPasswordExpiration` was never consulted, so the token never went stale — **3 of 14
 *      red** in §3: the vencido token was accepted, the password changed, and the old one stopped
 *      working.
 *
 * §4 needs no mutant: it reads the window out of the **running** config and compares it against
 * what was actually written to the row, so a config that stopped carrying FR-017's window fails
 * it by arithmetic rather than by a retyped constant.
 */

/** The host the REST request arrives on. `users` is global, so no tenant header is needed. */
const HOST = 'cite.fablab.test'

const SENHA_ORIGINAL = 't015-senha-original-123'
const SENHA_NOVA = 't015-senha-nova-456'
/** Distinct from {@link SENHA_NOVA}, so no assertion can pass by the two being equal. */
const SENHA_DA_SEGUNDA_TENTATIVA = 't015-senha-da-segunda-tentativa-789'

/**
 * One account per section. A refused sign-in increments Payload's per-account attempt counter
 * (`maxLoginAttempts: 5`), and sections that shared an account could lock each other out — which
 * would read as "the password no longer works" and quietly prove the wrong thing.
 */
const CONTAS = {
  neutra: 't015-neutra@example.com',
  usoUnico: 't015-uso-unico@example.com',
  expirado: 't015-expirado@example.com',
  janela: 't015-janela@example.com',
} as const

/** An address with no account anywhere — asserted in §1, never assumed. */
const DESCONHECIDA = 't015-nunca-cadastrada@example.com'

const TODOS_OS_EMAILS = [...Object.values(CONTAS), DESCONHECIDA]

let payload: Payload

/** A response as a caller receives it: everything it could tell two answers apart by. */
type Resposta = {
  readonly status: number
  readonly corpo: string
  readonly tipo: null | string
}

/** The reset columns as the database holds them, read below the field layer that hides them. */
type LinhaDeReset = {
  id: number | string
  resetPasswordExpiration?: Date | null | string
  resetPasswordToken?: null | string
}

/**
 * One POST to Payload's auth REST surface, through the handler `app/(payload)/api/[...slug]`
 * exports. `params.slug` is what the router resolves the path from — the URL is only there so
 * relative resolution and CORS have an origin.
 */
const postar = async (acao: string, dados: Record<string, unknown>): Promise<Resposta> => {
  const handler = REST_POST(configPromise)
  const request = new Request(`https://${HOST}/api/users/${acao}`, {
    method: 'POST',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dados),
  })
  const response = await handler(request, { params: Promise.resolve({ slug: ['users', acao] }) })
  return {
    status: response.status,
    corpo: await response.text(),
    tipo: response.headers.get('content-type'),
  }
}

const pedirReset = (email: string): Promise<Resposta> => postar('forgot-password', { email })

const usarToken = (token: string, password: string): Promise<Resposta> =>
  postar('reset-password', { token, password })

/**
 * The row as Postgres holds it.
 *
 * `payload.db.findOne` rather than `payload.find`: `resetPasswordToken` and
 * `resetPasswordExpiration` are `hidden` base auth fields, and the operation under test reads
 * them through the database layer too. Reading them any other way would be this file asserting
 * against a projection Payload never consults.
 */
const linhaDe = (email: string): Promise<LinhaDeReset | null> =>
  payload.db.findOne<LinhaDeReset>({ collection: 'users', where: { email: { equals: email } } })

/**
 * The token the mail would have carried.
 *
 * Absence is reported as itself: a helper that returned `''` here would send an empty token to
 * `/reset-password`, get the same refusal an expired token gets, and let §2 and §3 pass without
 * a reset ever having been possible.
 */
const tokenDe = async (email: string): Promise<string> => {
  const linha = await linhaDe(email)
  const token = linha?.resetPasswordToken
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(
      `no reset token was stored for ${email}; the row holds ` +
        `resetPasswordToken=${JSON.stringify(linha?.resetPasswordToken)}, ` +
        `resetPasswordExpiration=${JSON.stringify(linha?.resetPasswordExpiration)}`,
    )
  }
  return token
}

/**
 * How a sign-in ended, named rather than reduced to a boolean.
 *
 * A locked account (`LockedAuth`) and a refused password (`AuthenticationError`) are both "did
 * not get in", and a boolean would let a section that accidentally locked its account report
 * "the old password stopped working" — the exact conclusion §3 exists to draw.
 */
const tentarEntrar = async (email: string, password: string): Promise<string> => {
  try {
    await payload.login({ collection: 'users', data: { email, password } })
    return 'entrou'
  } catch (erro) {
    return (erro as { constructor?: { name?: string } })?.constructor?.name ?? 'erro'
  }
}

/**
 * Moves a live token's expiry into the past — the same column `forgotPasswordOperation` writes,
 * through the same Local API call it uses.
 *
 * Time is moved rather than waited for, and the row is moved rather than the clock: the expiry
 * check is a SQL comparison (`resetPasswordExpiration greater_than now`), so a faked system
 * clock would be testing whether Vitest can lie to `Date` rather than whether Payload refuses a
 * stale token.
 */
const expirar = async (email: string): Promise<void> => {
  const linha = await linhaDe(email)
  if (!linha) throw new Error(`cannot expire a token for ${email}: no such account`)
  await payload.update({
    collection: 'users',
    id: linha.id,
    data: { resetPasswordExpiration: new Date(Date.now() - 60_000).toISOString() } as never,
    overrideAccess: true,
  })
}

const criarConta = (email: string) =>
  payload.create({
    collection: 'users',
    // `overrideAccess: true` because `Users.access.create` is `masterOnly()`: who may create an
    // account is FR-022's question, and forcing this setup through the guarded path would make a
    // broken guard look like a broken reset flow.
    data: { email, password: SENHA_ORIGINAL, role: 'user', orgs: [] } as never,
    overrideAccess: true,
  })

const limpar = () =>
  payload.delete({
    collection: 'users',
    where: { email: { in: TODOS_OS_EMAILS } },
    overrideAccess: true,
  })

beforeAll(async () => {
  payload = await getPayload({ config: configPromise })
  await limpar()
  for (const email of Object.values(CONTAS)) await criarConta(email)
}, 120_000)

afterAll(async () => {
  await limpar()
})

/**
 * §1 — FR-017: the same response body and status, registered or not.
 */
describe('o pedido de reset responde o mesmo para cadastrado e desconhecido (FR-017)', () => {
  let desconhecida: Resposta
  let cadastrada: Resposta

  beforeAll(async () => {
    // The unknown address answers first: it is the reference, and asking it first keeps a
    // failure from reading as "the second call was different" when it is the first that moved.
    desconhecida = await pedirReset(DESCONHECIDA)
    cadastrada = await pedirReset(CONTAS.neutra)
  })

  it('o endereço de referência realmente não tem conta, nem ganha uma ao pedir', async () => {
    expect(await linhaDe(DESCONHECIDA)).toBeNull()
  })

  it('o endereço cadastrado realmente emitiu um token com validade futura', async () => {
    const token = await tokenDe(CONTAS.neutra)
    expect(token.length).toBeGreaterThan(0)
    const linha = await linhaDe(CONTAS.neutra)
    expect(new Date(linha?.resetPasswordExpiration ?? 0).getTime()).toBeGreaterThan(Date.now())
  })

  it('responde o mesmo status', () => {
    expect(cadastrada.status).toBe(desconhecida.status)
    expect(desconhecida.status).toBe(200)
  })

  it('responde o mesmo corpo, byte a byte', () => {
    expect(cadastrada.corpo).toBe(desconhecida.corpo)
  })

  it('responde o mesmo content-type', () => {
    expect(cadastrada.tipo).toBe(desconhecida.tipo)
  })

  it('não devolve o token a quem pediu', () => {
    expect(cadastrada.corpo).not.toContain('resetPasswordToken')
    expect(cadastrada.corpo).not.toMatch(/[0-9a-f]{40}/)
  })
})

/**
 * §2 — SC-003 / US4 edge: the link is used twice, and the second use is refused.
 */
describe('um token serve uma única vez (SC-003, US4)', () => {
  let primeiroUso: Resposta
  let segundoUso: Resposta
  let comSenhaNova: string
  let comSenhaDaSegunda: string

  beforeAll(async () => {
    await pedirReset(CONTAS.usoUnico)
    const token = await tokenDe(CONTAS.usoUnico)
    primeiroUso = await usarToken(token, SENHA_NOVA)
    segundoUso = await usarToken(token, SENHA_DA_SEGUNDA_TENTATIVA)
    // The successful sign-in runs first on purpose: it clears the attempt counter, so the two
    // refusals that follow cannot walk the account towards `maxLoginAttempts`.
    comSenhaNova = await tentarEntrar(CONTAS.usoUnico, SENHA_NOVA)
    comSenhaDaSegunda = await tentarEntrar(CONTAS.usoUnico, SENHA_DA_SEGUNDA_TENTATIVA)
  })

  it('aceita o primeiro uso', () => {
    expect(primeiroUso.status).toBe(200)
  })

  it('recusa o segundo uso, e diz que recusou', () => {
    expect(segundoUso.status).not.toBe(200)
    expect(segundoUso.status).toBeGreaterThanOrEqual(400)
    const corpo = JSON.parse(segundoUso.corpo) as { errors?: { message?: string }[] }
    expect(corpo.errors?.[0]?.message ?? '').not.toBe('')
  })

  it('a senha do primeiro uso é a que vale', () => {
    expect(comSenhaNova).toBe('entrou')
  })

  it('a senha enviada no segundo uso não abre a conta', () => {
    expect(comSenhaDaSegunda).toBe('AuthenticationError')
  })
})

/**
 * §3 — US4 error branch: the link expired, and the old password still works.
 */
describe('um token expirado é recusado e a senha antiga continua valendo (FR-017, US4)', () => {
  let recusa: Resposta
  let comSenhaOriginal: string
  let comSenhaNova: string

  beforeAll(async () => {
    await pedirReset(CONTAS.expirado)
    const token = await tokenDe(CONTAS.expirado)
    await expirar(CONTAS.expirado)
    recusa = await usarToken(token, SENHA_NOVA)
    comSenhaNova = await tentarEntrar(CONTAS.expirado, SENHA_NOVA)
    comSenhaOriginal = await tentarEntrar(CONTAS.expirado, SENHA_ORIGINAL)
  })

  it('recusa o token vencido', () => {
    expect(recusa.status).not.toBe(200)
    expect(recusa.status).toBeGreaterThanOrEqual(400)
  })

  it('não troca a senha', () => {
    expect(comSenhaNova).toBe('AuthenticationError')
  })

  it('a senha antiga continua abrindo a conta', () => {
    expect(comSenhaOriginal).toBe('entrou')
  })
})

/**
 * §4 — FR-017: *time-limited*, and the limit is the one the config carries.
 */
describe('a validade é a janela que o config declara (FR-017)', () => {
  it('grava exatamente agora + Users.auth.forgotPassword.expiration', async () => {
    // Read from the **running** instance rather than retyped: T011 owns the number, and a copy
    // of it here would keep passing after someone changed the config it is supposed to describe.
    const auth = payload.collections.users?.config.auth as
      | { forgotPassword?: { expiration?: unknown } }
      | undefined
    const janela = auth?.forgotPassword?.expiration
    expect(typeof janela).toBe('number')

    const antes = Date.now()
    await pedirReset(CONTAS.janela)
    const depois = Date.now()

    const linha = await linhaDe(CONTAS.janela)
    const expira = new Date(linha?.resetPasswordExpiration ?? 0).getTime()
    // The operation stamps `Date.now() + janela` somewhere inside this window, so the bounds are
    // exact rather than a tolerance — no arbitrary slack to widen later.
    expect(expira).toBeGreaterThanOrEqual(antes + (janela as number))
    expect(expira).toBeLessThanOrEqual(depois + (janela as number))
  })
})
