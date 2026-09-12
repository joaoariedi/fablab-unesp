import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import config from '../../payload.config'
import { Users } from '../../collections/Users.js'

/**
 * T013b / FR-018, US3 — sign-out **invalidates the session server-side**, and the session
 * lifetime is a number this suite asserts rather than one Payload happened to supply.
 *
 * ── The one assertion the whole task turns on ───────────────────────────────────────────────
 *
 * A sign-out that only deletes the cookie leaves the token it was carrying **still valid**: the
 * copy in a proxy log, a shared terminal's history, or an extension's storage authenticates for
 * the rest of `tokenExpiration` — two hours here — and the maker who pressed `SAIR` has no way to
 * know. So the discriminating test is not "the cookie is gone". It is: take the very token the
 * login issued, sign out, present that same token again, and be refused. A cookie-clearing
 * sign-out passes every other check in this file and fails that one.
 *
 * The mechanism is Payload's own: with `auth.useSessions`, the JWT carries a `sid` and
 * `JWTAuthentication` refuses a token whose `sid` is no longer in the account's `sessions`
 * array (`payload/dist/auth/strategies/jwt.js`). `logoutOperation` removes that row. Hence the
 * `useSessions` assertion below — it is not decoration, it is the switch that decides whether
 * sign-out invalidates anything at all: with it off, `logoutOperation` skips the write entirely
 * and every sign-out in the product silently becomes cookie-only.
 *
 * ── Why `signOut` is reached through the namespace instead of a named import ────────────────
 *
 * A missing named export is a **module-load failure**, which aborts the file and reports it with
 * no assertions — preamble item 1, the shape that silenced 160 tests in 002. Read through the
 * namespace, the absence of `signOut` is a failure that *names itself* in the first test rather
 * than a suite that never ran.
 *
 * ── Why this suite drives the real database ────────────────────────────────────────────────
 *
 * Server-side invalidation is a claim about *stored state*: the session row is gone, so the
 * token is dead. There is nothing to assert against a mocked Payload except the mock. Only
 * `next/headers` is faked, because it is a Next request scope and Vitest has none — the fake
 * carries the real token and collects what the real cookie jar would have been told.
 */

const mocks = vi.hoisted(() => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async (): Promise<unknown> => undefined),
}))

vi.mock('next/headers', () => ({ cookies: mocks.cookies, headers: mocks.headers }))

/**
 * The module under test, read as a namespace so a missing `signOut` fails an assertion instead
 * of aborting the file. `signOut` is optional in this type for exactly that reason.
 */
type SessionModule = { signOut?: () => Promise<void> }
const sessionModule = (await import('../../lib/tenancy/session.js')) as SessionModule

const EMAIL = 't013b-sessao@example.com'
const PASSWORD = 'sign-out-invalidates-123'

type Conta = { id: string | number }
type Sessao = { id: string; createdAt: string; expiresAt: string }
type Login = { token?: string }

let payload: Payload
/** Memoised: every test signs in again — a fresh session each time — but on one account. */
let conta: Promise<Conta> | null = null

/**
 * The `users` collection as the running instance holds it, narrowed rather than indexed.
 * `payload-types.ts` is gitignored and CI compiles without it (preamble item 6), so a bare
 * `payload.collections.users` typechecks here and fails there.
 */
const usersConfig = () => {
  const collection = payload.collections.users
  if (!collection) {
    throw new Error(
      `the running config has no \`users\` collection; it holds: ${Object.keys(payload.collections).join(', ')}`,
    )
  }
  return collection.config
}

type OpcoesAuth = { tokenExpiration?: unknown; useSessions?: unknown }
const authOptions = (): OpcoesAuth => usersConfig().auth as OpcoesAuth

/** The cookie Payload signs sessions into, named from the running config rather than retyped. */
const nomeDoCookie = () => `${payload.config.cookiePrefix}-token`

/**
 * What a cookie jar was told, and whether a live session cookie survives it.
 *
 * A named fake rather than an inline stub: `signOut` may clear the cookie by deleting it or by
 * writing an already-expired one, and both are correct. `temTokenVivo` answers the question the
 * requirement actually asks — would the browser still send a token? — so the test does not pin
 * the implementation to one of the two spellings.
 */
class FakeCookieJar {
  readonly escritos: Array<{ name: string; value?: string; expires?: Date | string | number }> = []
  readonly apagados: string[] = []

  set(cookie: { name: string; value?: string; expires?: Date | string | number }): void {
    this.escritos.push(cookie)
  }

  delete(name: string): void {
    this.apagados.push(name)
  }

  temTokenVivo(nome: string): boolean {
    if (this.apagados.includes(nome)) return false
    const ultimo = this.escritos.filter((cookie) => cookie.name === nome).at(-1)
    if (!ultimo) return false
    if (!ultimo.value) return false
    return ultimo.expires === undefined || new Date(ultimo.expires).getTime() > Date.now()
  }
}

const criarConta = (): Promise<Conta> =>
  (conta ??= payload.create({
    collection: 'users',
    data: { email: EMAIL, password: PASSWORD, role: 'user', orgs: [] },
    overrideAccess: true,
  }))

/** A fresh session for the shared account: a real login, so a real token and a real session row. */
async function entrar(): Promise<string> {
  await criarConta()
  const { token } = (await payload.login({
    collection: 'users',
    data: { email: EMAIL, password: PASSWORD },
  })) as Login
  if (!token) throw new Error('login issued no token; there is no session to sign out of')
  return token
}

/** Presents a token exactly as a browser would, and reports whether Payload accepts it. */
async function aindaAutentica(token: string): Promise<boolean> {
  const headers = new Headers({ cookie: `${nomeDoCookie()}=${token}` })
  const { user } = await payload.auth({ headers })
  return Boolean(user)
}

/** The `sid` claim: which session row this token is bound to. */
function sessaoDoToken(token: string): string {
  const [, claims] = token.split('.')
  if (!claims) throw new Error(`not a JWT: ${token.slice(0, 12)}…`)
  const sid = (JSON.parse(Buffer.from(claims, 'base64url').toString()) as { sid?: string }).sid
  if (!sid) {
    throw new Error(
      'the token carries no `sid` claim — Payload is not issuing sessions, so nothing can be ' +
        'revoked server-side and sign-out could only ever clear a cookie',
    )
  }
  return sid
}

/** The session rows the account holds right now, straight from the database. */
async function sessoesArmazenadas(): Promise<Sessao[]> {
  const { id } = await criarConta()
  const doc = (await payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
  })) as unknown as { sessions?: Sessao[] }
  return doc.sessions ?? []
}

/**
 * Runs `signOut` inside a request that carries `token`, and returns the jar it wrote to.
 *
 * The absence of the export is reported here, once, with the reason — rather than as a
 * `TypeError: undefined is not a function` in four tests.
 */
async function sairCom(token: string): Promise<FakeCookieJar> {
  const jar = new FakeCookieJar()
  mocks.headers.mockResolvedValue(new Headers({ cookie: `${nomeDoCookie()}=${token}` }))
  mocks.cookies.mockResolvedValue(jar)
  expect(
    typeof sessionModule.signOut,
    'lib/tenancy/session exports no `signOut`: FR-018 sign-out has nothing to call',
  ).toBe('function')
  await sessionModule.signOut?.()
  return jar
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({
    collection: 'users',
    where: { email: { equals: EMAIL } },
    overrideAccess: true,
  })
}, 120_000)

afterAll(async () => {
  if (payload) {
    await payload.delete({
      collection: 'users',
      where: { email: { equals: EMAIL } },
      overrideAccess: true,
    })
  }
})

describe('sign-out invalidates server-side (FR-018, US3)', () => {
  it('kills the very token it was holding, not just the cookie carrying it', async () => {
    const token = await entrar()
    expect(await aindaAutentica(token), 'the fresh token did not authenticate at all').toBe(true)

    await sairCom(token)

    expect(
      await aindaAutentica(token),
      'the token still authenticates after sign-out — the session was never invalidated ' +
        'server-side, so every copy of it stays usable until it expires on its own',
    ).toBe(false)
  })

  it('removes the account’s session row, which is what makes the refusal permanent', async () => {
    const token = await entrar()
    const sid = sessaoDoToken(token)
    expect(
      (await sessoesArmazenadas()).map((s) => s.id),
      'the login stored no session row for the token it issued',
    ).toContain(sid)

    await sairCom(token)

    expect(
      (await sessoesArmazenadas()).map((s) => s.id),
      'the session row survived sign-out — the token is refused only while the cookie is gone',
    ).not.toContain(sid)
  })

  it('clears the browser cookie as well, so the maker is signed out in front of them', async () => {
    const token = await entrar()
    const jar = await sairCom(token)
    expect(
      jar.temTokenVivo(nomeDoCookie()),
      'the jar still holds a live session cookie after sign-out',
    ).toBe(false)
  })

  it('ends this session only, and leaves the account’s other sessions signed in', async () => {
    // Signing out of a shared computer must not sign the maker out of their phone. It is also
    // what separates a targeted revocation from emptying the array, which would pass the two
    // tests above for the wrong reason.
    const outroDispositivo = await entrar()
    const esteDispositivo = await entrar()

    await sairCom(esteDispositivo)

    expect(await aindaAutentica(esteDispositivo)).toBe(false)
    expect(
      await aindaAutentica(outroDispositivo),
      'signing out of one device signed the account out everywhere',
    ).toBe(true)
  })
})

describe('the session lifetime is asserted, not inherited (FR-018)', () => {
  it('serves the two hours the collection declares', async () => {
    await criarConta()
    // Against the *running* config, after `payload.config.ts` and the multi-tenant plugin have
    // sanitized it: a plugin that re-set the lifetime would leave `Users.auth` untouched and a
    // source-text assertion green.
    expect(authOptions().tokenExpiration).toBe(7_200)
    expect(
      authOptions().tokenExpiration,
      'the running config and the collection disagree about how long a session lasts',
    ).toBe((Users.auth as { tokenExpiration?: unknown }).tokenExpiration)
  })

  it('keeps sessions on, which is the switch sign-out depends on', async () => {
    await criarConta()
    // With `useSessions` off, `logoutOperation` skips the write and the JWT strategy stops
    // checking `sid` — sign-out degrades to clearing a cookie with no test able to see it
    // except this one.
    expect(authOptions().useSessions).toBe(true)
  })

  it('stamps the stored session with that lifetime rather than some other one', async () => {
    const token = await entrar()
    const sid = sessaoDoToken(token)
    const sessao = (await sessoesArmazenadas()).find((s) => s.id === sid)
    expect(sessao, 'no stored session for the token just issued').toBeDefined()

    const vidaEmSegundos =
      (new Date(sessao!.expiresAt).getTime() - new Date(sessao!.createdAt).getTime()) / 1000
    expect(
      vidaEmSegundos,
      'the stored session outlives — or falls short of — the configured lifetime, so the ' +
        'declared two hours is not the number governing real sessions',
    ).toBe(authOptions().tokenExpiration)
  })
})
