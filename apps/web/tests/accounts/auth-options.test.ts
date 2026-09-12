import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { Users } from '../../collections/Users.js'
import { EMAIL_VERIFICATION_REQUIRED } from '../../lib/accounts/settings.js'

/**
 * T011 / FR-019, CLR-006 — the verification phase is one constant, and `Users.auth` is a
 * set of chosen values rather than Payload's defaults left alone.
 *
 * Three properties, and the third is the reason the task bundles the two files:
 *
 *  - **the constant is `false` and is a constant, not `process.env`.** CLR-006 rejects the
 *    environment variable explicitly: it would let production and development disagree
 *    about a security property with the wrong value invisible until someone looked.
 *  - **every auth option is written out.** `auth: true` means Payload's defaults are in
 *    force and nobody chose them; an upgrade that moves one is then a surprise rather than
 *    a diff (FR-015, FR-017, FR-018).
 *  - **`verify` is written as the constant, in source, never as a literal beside it.** A
 *    runtime check that `auth.verify === EMAIL_VERIFICATION_REQUIRED` passes just as
 *    happily when someone typed `verify: false` next to a constant that also happens to be
 *    `false` — and then phase 2 flips the constant and the config does not move. That
 *    silent drift is precisely what CLR-006 asks to be made impossible, so the reference
 *    itself is asserted against the file's text.
 */

const APP_DIR = join(import.meta.dirname, '..', '..')
const usersSource = readFileSync(join(APP_DIR, 'collections', 'Users.ts'), 'utf8')
const settingsSource = readFileSync(join(APP_DIR, 'lib', 'accounts', 'settings.ts'), 'utf8')

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

/**
 * Comments are stripped before either source is scanned. CLR-006's whole point is *recorded*
 * in prose — the settings docblock names the environment variable it rejects, and the comment
 * above `verify` quotes `verify: true` to say why the middle state does not exist. Scanning
 * the prose would assert against the explanation instead of against the code.
 */
const settingsCode = stripComments(settingsSource)
const usersCode = stripComments(usersSource)

type AuthOptions = {
  verify?: unknown
  maxLoginAttempts?: unknown
  lockTime?: unknown
  tokenExpiration?: unknown
  forgotPassword?: { expiration?: unknown }
}

const auth = Users.auth as AuthOptions | true | undefined

describe('EMAIL_VERIFICATION_REQUIRED (FR-019, CLR-006)', () => {
  it('records phase 1: no e-mail verification', () => {
    expect(EMAIL_VERIFICATION_REQUIRED).toBe(false)
  })

  it('is a constant, not an environment variable', () => {
    expect(settingsCode).toMatch(/export const EMAIL_VERIFICATION_REQUIRED\s*=\s*(true|false)\b/)
    expect(settingsCode).not.toMatch(/process\.env/)
  })
})

describe('Users.auth is chosen, not inherited (FR-015, FR-017, FR-018)', () => {
  it('is an options object rather than a bare `true`', () => {
    expect(auth).not.toBe(true)
    expect(typeof auth).toBe('object')
  })

  it('carries the per-account lock FR-015 fixes', () => {
    expect((auth as AuthOptions).maxLoginAttempts).toBe(5)
    expect((auth as AuthOptions).lockTime).toBe(600_000)
  })

  it('carries the session and reset windows FR-017/FR-018 ask for', () => {
    expect((auth as AuthOptions).tokenExpiration).toBe(7_200)
    expect((auth as AuthOptions).forgotPassword?.expiration).toBe(3_600_000)
  })
})

describe('`verify` is the constant, never a literal beside it (T011)', () => {
  it('agrees with the constant at runtime', () => {
    expect((auth as AuthOptions).verify).toBe(EMAIL_VERIFICATION_REQUIRED)
  })

  it('imports the constant from the settings module', () => {
    expect(usersCode).toMatch(
      /import\s*\{[^}]*\bEMAIL_VERIFICATION_REQUIRED\b[^}]*\}\s*from\s*['"][^'"]*lib\/accounts\/settings(\.js)?['"]/,
    )
  })

  it('writes `verify:` as that identifier and not as a boolean literal', () => {
    const assignment = usersCode.match(/\bverify\s*:\s*([A-Za-z0-9_.]+)/)
    expect(assignment?.[1]).toBe('EMAIL_VERIFICATION_REQUIRED')
  })
})
