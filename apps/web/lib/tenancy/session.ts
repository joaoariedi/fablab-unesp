import {
  createLocalReq,
  generateExpiredPayloadCookie,
  generatePayloadCookie,
  getPayload,
  logoutOperation,
} from 'payload'

/**
 * The two auth operations the login page needs, and the reason they live *here*.
 *
 * Authentication is not a data read, so the choke point does not cover it — `TenantScopedPayload`
 * exposes `find`/`create`/`update`/`delete` and nothing else, because those are the operations a
 * tenant filter has any meaning for. A sign-in has no tenant: `users` is **global** (identity is
 * global, the role is per organization — `collections/Users.ts`), and an address that exists in
 * one lab is the same account everywhere.
 *
 * ── Why a page cannot do this for itself ────────────────────────────────────────────────────
 *
 * `eslint.config.mjs` fences `getPayload` out of every file in `apps/web` except this directory,
 * the seed, the tests and `payload.config.ts`. That fence is what makes "nothing reaches Payload
 * except through `lib/tenancy`" enforceable rather than aspirational, so the login page importing
 * `getPayload` directly is not an option and should not become one. This module is therefore the
 * sanctioned door for auth, kept as narrow as the door for data: three functions, no options
 * object, and no way to ask it about an account without also signing in as one.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────────────────────
 *
 * No "does this address exist" lookup, in any spelling. FR-014 and FR-022 both turn on the
 * platform never answering that question, and a helper that answers it is one call site away from
 * being the oracle the neutral message exists to deny.
 */

/** The identity collection. Global: one e-mail is one account across the whole platform. */
const COLECAO_IDENTIDADE = 'users'

/** E-mail and password, as the login form collects them. PT-BR name, English field names —
 *  `senha` is the form's field, `password` is Payload's, and the mapping happens once, below. */
export type Credenciais = { readonly email: string; readonly senha: string }

/** As much of the signed-in account as a page is allowed to care about. Deliberately not
 *  Payload's `User`: a page needs to know *whether* someone is signed in, and the login page
 *  needs nothing else at all. */
export type SessionUser = { readonly id: string | number }

/** Payload, resolved the same way the choke point resolves it — a dynamic import of the config,
 *  so loading this module does not load the whole CMS in a test that only needs the types. */
async function payloadInstance() {
  return getPayload({ config: (await import('../../payload.config')).default })
}

/**
 * The `users` collection as the running instance holds it.
 *
 * Narrowed rather than indexed straight through: `payload-types.ts` is **gitignored**, so CI
 * compiles without it (tasks.md preamble item 6) and `payload.collections` is then an index
 * signature whose every read is possibly `undefined`. Measured — `tsc` with the generated types
 * moved aside reported exactly that on both of this module's reads, and CI compiles that way.
 */
function identityCollection(payload: Awaited<ReturnType<typeof payloadInstance>>) {
  const collection = payload.collections[COLECAO_IDENTIDADE]
  if (!collection) {
    throw new Error(
      `the running config has no \`${COLECAO_IDENTIDADE}\` collection; it holds: ` +
        Object.keys(payload.collections).join(', '),
    )
  }
  return collection
}

/**
 * The account this request is signed in as, or `null`.
 *
 * Reads the session from the request's own cookies through Payload's `auth()`, which verifies the
 * token rather than trusting its presence — the distinction that matters, because a page deciding
 * "signed in" from a cookie's *existence* sends a visitor holding a stale token to a guarded page
 * that bounces them straight back, and the two redirects become a loop.
 *
 * Only callable inside a Next request scope (`next/headers` throws outside one), which is why the
 * import is dynamic: binding it at module load would throw in Vitest, exactly as it does for
 * `getTenantScopedPayloadForRSC`.
 *
 * @example if (await currentUser()) redirect('/minha-conta')
 */
export async function currentUser(): Promise<SessionUser | null> {
  const { headers: nextHeaders } = await import('next/headers')
  const payload = await payloadInstance()
  const { user } = await payload.auth({ headers: await nextHeaders() })
  return user ? { id: user.id } : null
}

/**
 * Sign in, and leave the session cookie on the response.
 *
 * **Throws on every failure and says nothing about which one.** Payload's `login` raises the same
 * `AuthenticationError` for an unknown address and for a wrong password, and a `LockedAuth` for an
 * account past `maxLoginAttempts` — and the caller must not tell the three apart (FR-014): "this
 * account is locked" reveals that the address is registered just as surely as "no such user"
 * does. So this function does not classify, and there is nothing here for a caller to branch on.
 *
 * The cookie is Payload's own (`generatePayloadCookie`) rather than one assembled here, so the
 * prefix, `sameSite`, `secure` and the expiry all follow `Users.auth` — including
 * `tokenExpiration`, which FR-018 pins at two hours. A hand-rolled cookie would be a second
 * declaration of a security policy that already has one.
 *
 * @example await signIn({ email: 'maria@exemplo.br', senha: '…' })
 */
export async function signIn({ email, senha }: Credenciais): Promise<void> {
  const payload = await payloadInstance()
  const { token } = await payload.login({
    collection: COLECAO_IDENTIDADE,
    data: { email, password: senha },
  })

  // Payload returns no token when the collection is configured not to issue one. There is no
  // session in that case, so reporting success would sign nobody in and say otherwise.
  if (!token) throw new Error('login succeeded but issued no token; there is no session to set')

  const cookie = generatePayloadCookie({
    collectionAuthConfig: identityCollection(payload).config.auth,
    cookiePrefix: payload.config.cookiePrefix,
    returnCookieAsObject: true,
    token,
  })

  const { cookies: nextCookies } = await import('next/headers')
  const jar = await nextCookies()
  jar.set({
    ...cookie,
    value: cookie.value ?? '',
    // Two shape differences between what Payload emits and what Next's jar accepts, and both are
    // silent if spread unconverted: the expiry is a UTC *string* where a `Date` belongs, and
    // `sameSite` is capitalised (`'Lax'`) where Next's type is lower case.
    expires: cookie.expires === undefined ? undefined : new Date(cookie.expires),
    sameSite: cookie.sameSite?.toLowerCase() as 'lax' | 'none' | 'strict' | undefined,
  })
}

/**
 * Sign out: revoke the session **server-side**, then clear the cookie (FR-018, T013b).
 *
 * The order is the whole point, and so is the first half. A sign-out that only deletes the cookie
 * leaves the token it was carrying valid for the rest of `tokenExpiration` — two hours here — so
 * any copy of it (a proxy log, a shared terminal, an extension's storage) still authenticates
 * after the maker has pressed `SAIR` and been told they are out. Revoking first also means a
 * crash between the two halves leaves the *safe* state: a dead token and a stale cookie, rather
 * than a live token and no cookie.
 *
 * The revocation is Payload's own `logoutOperation`, not a hand-rolled write: it removes exactly
 * the session the presented token names (`req.user._sid`, set by the JWT strategy), inside a
 * transaction, after any `afterLogout` hook. That targeting is what keeps a sign-out on a shared
 * computer from signing the same account out on its owner's phone.
 *
 * **It depends on `Users.auth.useSessions`** — Payload's default, asserted by
 * `tests/accounts/session.test.ts` rather than assumed. With sessions off, `logoutOperation`
 * skips the write and the JWT strategy stops checking `sid`, and this function silently becomes
 * the cookie-clearing sign-out FR-018 exists to refuse.
 *
 * Signing out when nobody is signed in is a no-op that still clears the cookie: `payload.auth`
 * answers `null` for a token that is expired, revoked or forged, and there is nothing to revoke —
 * but a browser holding that cookie should still be relieved of it.
 *
 * @example await signOut()   // then redirect('/')
 */
export async function signOut(): Promise<void> {
  const payload = await payloadInstance()
  const collection = identityCollection(payload)

  const { headers: nextHeaders, cookies: nextCookies } = await import('next/headers')
  const { user } = await payload.auth({ headers: await nextHeaders() })

  if (user) {
    await logoutOperation({ collection, req: await createLocalReq({ user }, payload) })
  }

  // Payload's own expired cookie rather than `jar.delete(name)`: the deletion has to carry the
  // same `path`, `domain`, `secure` and `sameSite` the login wrote, or the browser keeps the
  // original cookie and only the maker's current path stops sending it.
  const cookie = generateExpiredPayloadCookie({
    collectionAuthConfig: collection.config.auth,
    cookiePrefix: payload.config.cookiePrefix,
    returnCookieAsObject: true,
  })

  const jar = await nextCookies()
  jar.set({
    ...cookie,
    value: '',
    // The same two conversions `signIn` makes, for the same reason: Payload emits a UTC string
    // where Next's jar wants a `Date`, and capitalises `sameSite` where Next's type is lower case.
    expires: cookie.expires === undefined ? undefined : new Date(cookie.expires),
    sameSite: cookie.sameSite?.toLowerCase() as 'lax' | 'none' | 'strict' | undefined,
  })
}
