import { describe, expect, it } from 'vitest'

import { teamOnly } from '../../lib/tenancy/access'

/**
 * T007 / FR-008, SC-005 — `teamOnly()` decides who may publish, and answers with a
 * **constraint** rather than a boolean.
 *
 * `admin` and `staff` are the lab team; `maker` submits and cannot publish. The distinction
 * that matters here is the return *shape*: a boolean authorises the operation and then leaks
 * every row, so a staff member of lab A would be able to publish lab B's content the moment a
 * route forgot to scope its query. Returning `{ tenant: { in: [A] } }` makes that impossible
 * by construction — which is why every assertion below checks the tenant list, not just that
 * the call was permitted.
 *
 * The rows are fabricated rather than seeded: `Access` is a pure function of `req.user`, and
 * the surfaces that compose it are already covered by `isolation.test.ts`.
 */

/** Payload calls access with the whole operation args; only `req.user` is read here. */
const decide = (user: unknown) => teamOnly()({ req: { user } } as never)

const membership = (organization: unknown, role?: string) => ({ organization, role })

describe('teamOnly() (T007, FR-008, SC-005)', () => {
  it('constrains a staff member to their own organizations, so lab B stays out of reach', () => {
    const result = decide({ role: 'user', orgs: [membership(1, 'staff')] })

    expect(
      result,
      'teamOnly returned a bare authorisation: a route that forgets to scope its query would ' +
        'let this staff member of lab 1 publish another lab\'s content (SC-005)',
    ).toEqual({ tenant: { in: [1] } })
  })

  it('admits admins too, and normalises a populated organization row to its id', () => {
    const result = decide({ orgs: [membership({ id: 'org-a' }, 'admin')] })

    expect(result).toEqual({ tenant: { in: ['org-a'] } })
  })

  it('drops the organizations where the user is only a maker', () => {
    const result = decide({
      orgs: [membership('a', 'maker'), membership('b', 'staff'), membership('c', 'maker')],
    })

    expect(
      result,
      'a maker membership leaked into the publish constraint — SC-005 says a maker cannot publish',
    ).toEqual({ tenant: { in: ['b'] } })
  })

  it('refuses a user who is a maker everywhere, rather than returning an empty match', () => {
    expect(decide({ orgs: [membership('a', 'maker'), membership('b', 'maker')] })).toBe(false)
  })

  it('refuses a membership row that carries no role at all', () => {
    expect(decide({ orgs: [membership('a')] })).toBe(false)
  })

  it('refuses an anonymous request', () => {
    expect(decide(null)).toBe(false)
    expect(decide(undefined)).toBe(false)
  })

  it('refuses a signed-in user with no memberships', () => {
    expect(decide({ role: 'user' })).toBe(false)
    expect(decide({ role: 'user', orgs: [] })).toBe(false)
  })

  it('lets master through unconstrained, the single cross-organization role (FR-015)', () => {
    expect(decide({ role: 'master' })).toBe(true)
  })

  it('ignores a membership row whose organization is missing, keeping the rest', () => {
    expect(decide({ orgs: [membership(null, 'admin'), membership(7, 'admin')] })).toEqual({
      tenant: { in: [7] },
    })
  })
})
