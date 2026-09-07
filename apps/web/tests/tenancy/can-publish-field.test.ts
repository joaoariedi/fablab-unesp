import { describe, expect, it } from 'vitest'

import { canPublishField, teamOnly } from '../../lib/tenancy/access'

/**
 * T008 / FR-008, SC-005 — `canPublishField` guards the `status` field, and is a **second
 * function** rather than `teamOnly` reused.
 *
 * Payload types `FieldAccess` as `(args) => boolean | Promise<boolean>`: it cannot return a
 * `Where`, so the trick `teamOnly` relies on — answer with a constraint and let the query
 * carry the scope — is unavailable here. The scope therefore has to be decided *inside* the
 * boolean, against the tenant of the document actually being written (`doc` on update, `data`
 * on create). That is the difference the tests below are for: same predicate, different
 * return shape, and a cross-tenant case that a naive "is this user on some lab team?" boolean
 * would wave through.
 *
 * Rows are fabricated because field access is a pure function of its args.
 */

type Args = { doc?: unknown; data?: unknown; siblingData?: unknown }

/**
 * Decide a **publish attempt**, which is what this function restricts.
 *
 * The incoming `status` defaults to `publicado` because that is the only transition FR-008
 * takes away from a maker. Every membership assertion below therefore keeps the meaning it
 * was written with. The rounds where the value is something else — the maker's own submit —
 * are asserted separately, and they are the half the original version got wrong: it read only
 * the membership and refused `rascunho → em_revisao` too, sealing the review queue shut.
 */
const decide = (user: unknown, args: Args = {}, status: unknown = 'publicado') =>
  canPublishField({
    req: { user },
    ...args,
    data: {
      ...((args.data as Record<string, unknown> | undefined) ?? {}),
      // `null` means "this write sets no status at all". It cannot be `undefined`: passing
      // `undefined` for a parameter with a default triggers the default, so the one case that
      // needs no status would have silently been given `publicado`.
      ...(status === null ? {} : { status }),
    },
  } as never)

const membership = (organization: unknown, role?: string) => ({ organization, role })

describe('canPublishField (T008, FR-008, SC-005)', () => {
  describe('it restricts the publish transition, not the field (FR-008)', () => {
    const maker = { orgs: [membership(1, 'maker')] }

    it('lets a maker submit their own draft for review', () => {
      expect(
        decide(maker, { doc: { tenant: 1 } }, 'em_revisao'),
        'a maker could not move their own draft to em_revisao. FR-008 has the maker submit ' +
          'and the team approve, so refusing this seals the review queue shut.',
      ).toBe(true)
    })

    it('lets a maker save a draft', () => {
      expect(decide(maker, { doc: { tenant: 1 } }, 'rascunho')).toBe(true)
    })

    it('leaves a write that sets no status alone', () => {
      // Editing a title must not be refused by the guard on a field the write never touches.
      expect(decide(maker, { doc: { tenant: 1 }, data: { titulo: 'Nova luminária' } }, null)).toBe(true)
    })

    it('still refuses that same maker the publish transition (SC-005)', () => {
      // The pair to the three above: they must not have bought their greenness by making the
      // function permissive. Same user, same document, only the value differs.
      expect(decide(maker, { doc: { tenant: 1 } }, 'publicado')).toBe(false)
    })

    it('reads the value from siblingData when status is nested', () => {
      expect(
        decide(maker, { doc: { tenant: 1 }, siblingData: { status: 'publicado' } }, null),
        'a status nested in a group or row was not seen, so the guard passed the write',
      ).toBe(false)
    })
  })

  it('answers with a boolean where teamOnly answers with a Where — the reason it exists', () => {
    const user = { orgs: [membership(1, 'staff')] }

    expect(
      typeof decide(user, { doc: { tenant: 1 } }),
      'field access must be boolean-only: Payload types FieldAccess as ' +
        '(args) => boolean | Promise<boolean> and will not accept a Where',
    ).toBe('boolean')
    // The sibling returns the constraint that this one cannot, which is why reusing it here
    // would not have typechecked.
    expect(typeof teamOnly()({ req: { user } } as never)).toBe('object')
  })

  it('lets a staff member publish in the organization the document belongs to', () => {
    expect(decide({ orgs: [membership(1, 'staff')] }, { doc: { tenant: 1 } })).toBe(true)
  })

  it('lets an admin publish, and normalises a populated tenant relationship to its id', () => {
    expect(
      decide({ orgs: [membership('org-a', 'admin')] }, { doc: { tenant: { id: 'org-a' } } }),
    ).toBe(true)
  })

  it('refuses a maker of that same organization (SC-005)', () => {
    expect(
      decide({ orgs: [membership(1, 'maker')] }, { doc: { tenant: 1 } }),
      'a maker published: SC-005 says the transition to publicado is refused for a non-team user',
    ).toBe(false)
  })

  it('refuses a staff member of another lab, the case a bare boolean would wave through', () => {
    expect(
      decide({ orgs: [membership('a', 'staff')] }, { doc: { tenant: 'b' } }),
      'staff of lab a published lab b content: field access cannot lean on a Where, so the ' +
        'tenant of the document under write has to be checked inside the boolean',
    ).toBe(false)
  })

  it('refuses a maker in the document tenant even when the user is staff elsewhere', () => {
    expect(
      decide(
        { orgs: [membership('a', 'staff'), membership('b', 'maker')] },
        { doc: { tenant: 'b' } },
      ),
    ).toBe(false)
  })

  it('reads the tenant from incoming data on a create, where there is no doc yet', () => {
    expect(decide({ orgs: [membership(2, 'staff')] }, { data: { tenant: 2 } })).toBe(true)
    expect(decide({ orgs: [membership(2, 'maker')] }, { data: { tenant: 2 } })).toBe(false)
  })

  it('prefers the stored tenant over incoming data, so a forged tenant buys nothing', () => {
    expect(
      decide(
        { orgs: [membership('a', 'staff'), membership('b', 'maker')] },
        { doc: { tenant: 'b' }, data: { tenant: 'a' } },
      ),
      'the incoming payload chose the tenant: a maker of lab b could publish by claiming lab a',
    ).toBe(false)
  })

  it('tolerates an id that arrives as a string on one side and a number on the other', () => {
    expect(decide({ orgs: [membership(7, 'staff')] }, { doc: { tenant: '7' } })).toBe(true)
  })

  it('falls back to "team everywhere" when no tenant can be determined', () => {
    // A partial update sends only the changed field and field access may be handed neither a
    // doc nor a tenant. Refusing outright would break a legitimate publish; trusting the
    // membership list would let a maker publish. The answer that is true whichever document
    // this turns out to be: the user is on the team in *every* organization they belong to.
    expect(decide({ orgs: [membership('a', 'staff'), membership('b', 'admin')] })).toBe(true)
    expect(decide({ orgs: [membership('a', 'staff'), membership('b', 'maker')] })).toBe(false)
  })

  it('refuses a membership row that carries no role at all', () => {
    expect(decide({ orgs: [membership('a')] }, { doc: { tenant: 'a' } })).toBe(false)
  })

  it('refuses an anonymous request', () => {
    expect(decide(null, { doc: { tenant: 1 } })).toBe(false)
    expect(decide(undefined, { doc: { tenant: 1 } })).toBe(false)
  })

  it('refuses a signed-in user with no memberships', () => {
    expect(decide({ role: 'user' }, { doc: { tenant: 1 } })).toBe(false)
    expect(decide({ role: 'user', orgs: [] }, { doc: { tenant: 1 } })).toBe(false)
  })

  it('lets master through, the single cross-organization role (FR-015)', () => {
    expect(decide({ role: 'master' }, { doc: { tenant: 'any' } })).toBe(true)
    expect(decide({ role: 'master' })).toBe(true)
  })
})
