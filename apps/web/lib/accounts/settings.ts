/**
 * Phase 1 (feature 004): NO e-mail verification. See spec § CLR-006.
 *
 * A constant, not `process.env`, and deliberately: an environment variable lets production and
 * development disagree about a security property with the wrong value invisible until someone
 * looks — the shape Principle 2 rejects for `TENANCY_MODE`. Verification is a phase of the
 * product, identical everywhere, so changing it is a commit somebody reviews.
 *
 * Flipping this to `true` is NOT sufficient on its own: Payload refuses login outright for an
 * unverified account (`login.js`; research.md § "verify is all-or-nothing at login"), so there
 * is no "may sign in, may not publish" middle state to fall back on. Phase 2 must first decide
 * whether refusing login is the rule it wants.
 *
 * `Users.auth.verify` reads this identifier — never a boolean beside it — so the two cannot
 * drift; `tests/accounts/auth-options.test.ts` holds the config's *source* to that reference.
 *
 * @example
 * import { EMAIL_VERIFICATION_REQUIRED } from '../lib/accounts/settings.js'
 * auth: { verify: EMAIL_VERIFICATION_REQUIRED }
 */
export const EMAIL_VERIFICATION_REQUIRED = false
