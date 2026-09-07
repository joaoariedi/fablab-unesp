import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * T006 / FR-008 — `access.ts`'s own `MaybeUser` must admit the `role` each `orgs[]` row
 * already carries.
 *
 * The role is not new: `payload.config.ts` declares it as a `rowFields` select on the
 * multi-tenant plugin's `orgs` array (`admin | staff | maker`, required), and `invite.ts`
 * reads `membership.role === 'admin'` through a *local* copy of the user shape. Only
 * `access.ts`'s type omits it — which is why the role looked absent from access control and
 * why `teamOnly` (T007) and `canPublishField` (T008) could not be written against it: a
 * membership row typed `{ organization?: unknown }` makes `row.role` a compile error.
 *
 * A type widening has no runtime behaviour, so the assertions here are **executed, not
 * read**: each probe writes a throwaway file, runs the app's real `tsc` over it, and deletes
 * it again. The probes are paired on purpose. The positive one alone would also pass if the
 * row were typed `any` or `unknown` — a widening that admits `role` by admitting everything,
 * and that would silently accept `role: 42` in `teamOnly`'s comparison. The negative one
 * fixes the field to a *typed* one. Neither direction proves the point without the other.
 */

const WEB_DIR = fileURLToPath(new URL('../..', import.meta.url))
const TSC_BIN = join(WEB_DIR, 'node_modules', '.bin', 'tsc')
const PROBE_DIR = join(WEB_DIR, 'tests', 'tenancy', '__tsc_probe__')

/** `tsc` over a probe plus its import graph is ~1s warm; this only guards a cold cache. */
const TSC_TIMEOUT_MS = 120_000

interface TscResult {
  readonly exitCode: number
  readonly output: string
}

/**
 * Compiles one throwaway file with the app's own strictness, standalone rather than through
 * `tsconfig.json`: the project config pulls in `.next/types` and every collection, which
 * would report failures that have nothing to do with the type under test.
 */
function typecheckProbe(source: string): TscResult {
  mkdirSync(PROBE_DIR, { recursive: true })
  const probePath = join(PROBE_DIR, 'probe.ts')
  writeFileSync(probePath, source, 'utf8')
  try {
    const output = execFileSync(
      TSC_BIN,
      [
        '--noEmit',
        '--strict',
        '--target', 'ES2022',
        '--module', 'ESNext',
        '--moduleResolution', 'bundler',
        '--skipLibCheck',
        probePath,
      ],
      { cwd: WEB_DIR, encoding: 'utf8', stdio: 'pipe', timeout: TSC_TIMEOUT_MS },
    )
    return { exitCode: 0, output }
  } catch (error) {
    const failure = error as { status?: number | null; stdout?: string; stderr?: string }
    return {
      exitCode: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    }
  }
}

/**
 * Probes reach `access.ts` through `isMaster`'s parameter rather than an exported alias, so
 * the assertion is about the type access control actually uses — not about a second type
 * that happens to be exported beside it.
 */
const PROBE_PREAMBLE = `import { isMaster } from '../../../lib/tenancy/access'

type AccessUser = NonNullable<Parameters<typeof isMaster>[0]>
type MembershipRow = NonNullable<AccessUser['orgs']>[number]
`

afterEach(() => {
  rmSync(PROBE_DIR, { recursive: true, force: true })
})

describe('MaybeUser membership rows carry `role` (T006, FR-008)', () => {
  it('accepts a membership row that declares its role, and lets access control read it', () => {
    const result = typecheckProbe(`${PROBE_PREAMBLE}
const user: AccessUser = {
  role: 'user',
  orgs: [
    { organization: 1, role: 'admin' },
    { organization: { id: 2 }, role: 'staff' },
    { organization: 3, role: 'maker' },
  ],
}

// What T007's \`teamOnly\` and T008's \`canPublishField\` need to compile: reading the role
// off a row, and comparing it to the values \`payload.config.ts\` declares.
export const teamTenants = (user.orgs ?? [])
  .filter((row: MembershipRow) => row.role === 'admin' || row.role === 'staff')
  .map((row: MembershipRow) => row.organization)
`)

    expect(
      result.exitCode,
      `access.ts's MaybeUser rejects the role its orgs[] rows already carry:\n${result.output}`,
    ).toBe(0)
  })

  it('still rejects a role that is not a role, so the widening is a typed field', () => {
    const result = typecheckProbe(`${PROBE_PREAMBLE}
export const user: AccessUser = { orgs: [{ organization: 1, role: 42 }] }
`)

    expect(
      result.exitCode,
      'orgs[].role admits a number — the row was widened to any/unknown rather than typed',
    ).not.toBe(0)
    // Pin the *reason*: an assignability/excess-property error reported on the probe itself,
    // not a resolution failure that would fail this test for free. tsc words this one
    // "Type 'number' is not assignable to type 'string'" and never names the field, so
    // matching the field name here would only assert tsc's phrasing.
    expect(result.output, result.output).toMatch(/probe\.ts\(\d+,\d+\): error TS(2322|2353)/)
  })

  it('leaves a row free to omit the role, since the shape describes untrusted request data', () => {
    // `req.user` is whatever the session deserialised to. The existing type makes every
    // field optional for that reason, and `tenantIdsOf` already tolerates a row with no
    // usable `organization`; a required `role` here would force casts at the call sites.
    const result = typecheckProbe(`${PROBE_PREAMBLE}
export const user: AccessUser = { orgs: [{ organization: 1 }] }
`)

    expect(result.exitCode, result.output).toBe(0)
  })
})
