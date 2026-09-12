import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { EMAIL_VERIFICATION_REQUIRED } from '../../lib/accounts/settings.js'

/**
 * T012 / SC-014, US9 — phase 1 ships no e-mail verification, and the proof is that an
 * account works the instant it exists.
 *
 * **What this file adds over `auth-options.test.ts`.** That one reads the *source*: it holds
 * `Users.ts` to writing `verify:` as the identifier, so the config cannot drift from the
 * constant in a diff. It never starts Payload. Both halves of SC-014 need the running
 * product instead:
 *
 *  - **the two agree where it counts** — not on the collection literal we export, but on the
 *    config Payload actually serves after `payload.config.ts` and the multi-tenant plugin
 *    have sanitized it. A plugin or a default that re-introduced verification would leave
 *    `Users.auth.verify` untouched and every source-text assertion green.
 *  - **an account is usable immediately** — created, then signed in, then reading its own row
 *    through the guarded path, with no verification step anywhere between. CLR-006 records
 *    that Payload's `verify: true` refuses login outright, so this sequence is exactly the
 *    one that stops working the day the phase flips. That is the point: when phase 2 arrives
 *    this file must go red and be rewritten, rather than quietly asserting a claim that has
 *    become false (preamble item 3).
 *
 * The account is made with `overrideAccess: true` because `Users.access.create` is
 * `masterOnly()` and the public signup path (T027) does not exist yet — who may create an
 * account is FR-022's question, not this file's. The **read** afterwards is deliberately NOT
 * overridden: it is what "usable" means.
 *
 * **Watched failing before it was believed** (preamble item 4). Two mutations, each restored:
 * `EMAIL_VERIFICATION_REQUIRED = true` took five of the six red, `UnverifiedEmail` named on the
 * login; `verify: true` written beside an unchanged `false` constant took all six, the first of
 * them reporting the drift itself. Neither leaves the file green.
 *
 * Repeating either mutation costs a database repair, so it is written down here: with `verify`
 * on, Payload's dev push adds `_verified` and `_verificationtoken` to `users`, and restoring
 * the config then asks to drop two populated columns — which **prompts on a TTY** and hangs the
 * run (preamble item 7). Drop them by hand before re-running.
 *
 * **Why the signup does not live in `beforeAll`** — measured, not assumed. Flipping
 * `EMAIL_VERIFICATION_REQUIRED` to `true` and running this file with the create+login in the
 * hook reported `1 failed suite, 6 skipped` and *no* assertion: Payload throws
 * `UnverifiedEmail` out of `login`, the hook aborts the file, and the three config checks
 * that name the actual cause never run (preamble item 1 — the shape that silenced 160 tests
 * in 002). Each step is therefore awaited inside the test that asserts it, memoised so the
 * account is still created once.
 */

const EMAIL = 't012-unverified@example.com'
const PASSWORD = 'verification-phase-123'

/**
 * Only the id is named. `payload.create` returns the generated `User`, and `payload-types.ts`
 * is gitignored — CI compiles without it (preamble item 6) — so anything this file asserted
 * through that type would typecheck differently in the two places. The verification fields are
 * read through `VerificationFields` below precisely because they are *absent* from the document
 * in phase 1.
 */
type Account = { id: string | number }
type VerificationFields = { _verified?: unknown; _verificationToken?: unknown }
type Session = { token?: string; user?: { id?: string | number } }

let payload: Payload
/** Memoised so the file signs up once, without a hook that can abort it. */
let signup: Promise<Account> | null = null
let session: Promise<Session> | null = null

const createAccount = (): Promise<Account> =>
  (signup ??= payload.create({
    collection: 'users',
    data: { email: EMAIL, password: PASSWORD, role: 'user', orgs: [] },
    overrideAccess: true,
  }))

/**
 * Signs in with nothing in between: no verification call, no token, no second request. If a
 * step were needed it would have to go here, and its absence is what SC-014 asks for.
 */
const signIn = (): Promise<Session> =>
  (session ??= createAccount().then(() =>
    payload.login({ collection: 'users', data: { email: EMAIL, password: PASSWORD } }),
  ) as Promise<Session>)

/**
 * The `users` collection as the running instance holds it.
 *
 * Narrowed rather than indexed directly: without `payload-types.ts` — which is gitignored, so
 * CI compiles without it (preamble item 6) — `payload.collections` is an index signature and
 * every `.users` read is `possibly undefined`. Measured: the first draft typechecked locally
 * and failed CI's compile on exactly those two lines.
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

/** Leaves no account behind for the next file's `resetWorld` to be surprised by. */
const removeAccount = () =>
  payload.delete({ collection: 'users', where: { email: { equals: EMAIL } }, overrideAccess: true })

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeAccount()
}, 120_000)

afterAll(async () => {
  if (payload) await removeAccount()
})

describe('the constant and the running config agree (SC-014)', () => {
  /**
   * Whether the *running* config asks for verification, as a boolean.
   *
   * Not `verify === true`, and that is measured: sanitizing a config written
   * `verify: true` leaves `payload.collections.users.config.auth.verify` as `{}` — Payload
   * widens the flag into its options object (`generateEmailHTML`, `generateEmailSubject`).
   * Comparing the sanitized value with the constant by identity would therefore report
   * "they disagree" on the day phase 2 turns verification on *correctly*. The agreement
   * SC-014 asks for is about the answer, so the answer is what is compared.
   */
  const verificationEnabled = (): boolean =>
    Boolean((usersConfig().auth as { verify?: unknown }).verify)

  it('serves the verification phase the constant records', () => {
    expect(verificationEnabled()).toBe(EMAIL_VERIFICATION_REQUIRED)
  })

  it('is phase 1: verification is off', () => {
    expect(verificationEnabled(), 'phase 1 ships no verification — CLR-006').toBe(false)
  })

  it('grows no verification fields, which is how Payload expresses the same fact', () => {
    // Payload injects `_verified` and `_verificationToken` into an auth collection only when
    // `verify` is on. Their absence is the schema-level restatement of the flag, and it is
    // the half a plugin could break without touching our source.
    const names = usersConfig().fields
      .map((field) => (field as { name?: string }).name)
      .filter((name): name is string => typeof name === 'string')
    expect(names).not.toContain('_verified')
    expect(names).not.toContain('_verificationToken')
  })
})

describe('an account is usable immediately, with no verification (SC-014, US9)', () => {
  it('is created without a verification flag to satisfy', async () => {
    const account = (await createAccount()) as Account & VerificationFields
    expect(account.id).toBeTruthy()
    expect(account._verified).toBeUndefined()
    expect(account._verificationToken).toBeUndefined()
  })

  it('signs in on the first attempt, right after being created', async () => {
    // `verify: true` makes Payload's `login` throw `UnverifiedEmail` before any password
    // check, so a token here is the whole of "no verification stands between signup and use".
    const account = await createAccount()
    const result = await signIn()
    expect(result.token, 'login returned no token — the account cannot be used').toBeTruthy()
    expect(result.user?.id).toBe(account.id)
  })

  it('acts as itself through the guarded path, not only with access overridden', async () => {
    // `overrideAccess: false` with the signed-in identity: `masterOrSelf()` must answer for a
    // brand-new, unverified account. A create that succeeds and a session that can do nothing
    // is not an account "in use".
    const account = await createAccount()
    await signIn()
    const result = await payload.find({
      collection: 'users',
      where: { id: { equals: account.id } },
      user: { ...account, collection: 'users' } as never,
      overrideAccess: false,
    })
    expect(result.docs).toHaveLength(1)
    expect((result.docs[0] as { email?: string }).email).toBe(EMAIL)
  })
})
