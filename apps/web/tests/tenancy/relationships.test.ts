import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '../../payload.config'
import { normalizeRefs, sameTenant } from '../../lib/tenancy/same-tenant-validator'
import { buildWorld, type Fixture } from './fixtures'

/**
 * The same-tenant relationship guard (FR-016, SC-005, US6).
 *
 * This validator is project code because **the plugin does not do it**. Spike S4c proved it
 * live: a row in organization A was updated to point at a row in organization B and the
 * write *succeeded*. Everything here defends that hole.
 */

let world: Fixture

/**
 * Fixture ids are `string | number` because the fixtures are collection-agnostic, but
 * Payload's generated types want the concrete id type of this adapter (integer). Coerce at
 * the call site rather than widening the fixture, which would push `as never` into every
 * other test.
 */
const asId = (v: string | number): number => Number(v)

beforeAll(async () => {
  world = await buildWorld()
}, 120_000)

describe('cross-tenant relationships are rejected', () => {
  it('refuses a row in A pointing at a row in B', async () => {
    const payload = await getPayload({ config })
    let error: unknown = null

    try {
      await payload.update({
        collection: 'tenantCanaries',
        id: world.rows.tenantCanaries!.A,
        data: { related: asId(world.rows.tenantCanaries!.B) },
        overrideAccess: true, // validation runs regardless — this is not an access question
      })
    } catch (err) {
      error = err
    }

    expect(error, 'a cross-tenant relationship was accepted — the S4c hole is open').not.toBeNull()
  })

  it('names the field but NOT the owning organization', async () => {
    const payload = await getPayload({ config })
    let message = ''

    try {
      await payload.update({
        collection: 'tenantCanaries',
        id: world.rows.tenantCanaries!.A,
        data: { related: asId(world.rows.tenantCanaries!.B) },
        overrideAccess: true,
      })
    } catch (err) {
      const e = err as { message?: string; data?: { errors?: { message?: string }[] } }
      message = [e.message, ...(e.data?.errors ?? []).map((x) => x.message)].join(' ')
    }

    // The reader must be told which field is wrong.
    expect(message.toLowerCase()).toMatch(/related|relacionado/)

    // But NOT who owns the other document. Naming it would turn any relationship input into
    // an ID-ownership oracle — feed it ids, read back which organization owns them — which
    // is the same enumeration US8 forbids on the invite endpoint.
    expect(message, 'the error disclosed the owning organization').not.toContain(world.orgB.slug)
    expect(message).not.toContain('Organização B')
    expect(message).not.toContain(String(world.orgB.id))
  })

  it('allows a relationship within the same organization', async () => {
    const payload = await getPayload({ config })
    const second = await payload.create({
      collection: 'tenantCanaries',
      data: { label: 'A-2', tenant: asId(world.orgA.id) },
      overrideAccess: true,
    })

    const updated = await payload.update({
      collection: 'tenantCanaries',
      id: world.rows.tenantCanaries!.A,
      data: { related: second.id },
      depth: 0,
      overrideAccess: true,
    })
    expect(updated.related).toBeTruthy()
  })
})

describe('sameTenant: the cases the first draft would have missed', () => {
  // NOTE the shape: Payload spreads the field config into the TOP level of the validate
  // options, so `relationTo` sits beside `data`, not under a `field` key. These tests
  // previously used an invented `{ field: { relationTo } }` shape and passed while the
  // validator was letting every cross-tenant write through — the integration test above is
  // what caught it. Constructing the real shape here is what makes these worth running.
  const opts = (tenant: unknown, relationTo = 'tenantCanaries') => ({
    siblingData: { tenant },
    data: { tenant },
    name: 'related',
    relationTo,
  })

  it('passes when the document has no tenant yet, letting the tenant field own that error', async () => {
    // Spike S4: on a create with no tenant this validator runs BEFORE the tenant field
    // reports "required". Competing for that failure would show two errors for one cause and
    // point the reader at the wrong field.
    await expect(sameTenant('anything', opts(null))).resolves.toBe(true)
  })

  it('always passes a relationship to a GLOBAL collection', async () => {
    // `users` and `organizations` are platform-wide, so "same tenant" is not a meaningful
    // question for them — asking it would reject every legitimate `invitedBy`.
    await expect(
      sameTenant(world.master.id, opts(world.orgA.id, 'users')),
    ).resolves.toBe(true)
  })

  it('reads data.tenant when siblingData has none (nested field position)', async () => {
    // siblingData resolves to the enclosing object, so for a relationship nested in a group
    // or array it does NOT carry the root tenant. Falling back to `data` is what makes the
    // validator correct in both positions.
    const nested = {
      siblingData: { somethingElse: true },
      data: { tenant: world.orgA.id },
      name: 'related',
      relationTo: 'tenantCanaries',
    }
    await expect(sameTenant(world.rows.tenantCanaries!.B, nested)).resolves.toMatch(/related/)
  })
})

describe('the option shape itself (regression guard)', () => {
  it('rejects a cross-tenant ref using Payload\'s real top-level relationTo', async () => {
    // If someone "tidies" this back to options.field.relationTo, normalizeRefs returns an
    // empty list and the validator silently answers true to everything. That defect shipped
    // once; this is the assertion that would have caught it without a database.
    const result = await sameTenant(world.rows.tenantCanaries!.B, {
      siblingData: { tenant: world.orgA.id },
      data: { tenant: world.orgA.id },
      name: 'related',
      relationTo: 'tenantCanaries',
    })
    expect(result, 'validator passed a cross-tenant ref — relationTo was not read').not.toBe(true)
  })
})

describe('normalizeRefs: all four relationship shapes', () => {
  it('handles a bare id', () => {
    expect(normalizeRefs('abc', 'tenantCanaries')).toEqual([
      { relationTo: 'tenantCanaries', id: 'abc' },
    ])
  })

  it('handles hasMany', () => {
    expect(normalizeRefs(['a', 'b'], 'tenantCanaries')).toHaveLength(2)
  })

  it('handles polymorphic { relationTo, value }', () => {
    expect(normalizeRefs({ relationTo: 'users', value: 7 }, ['users', 'tenantCanaries'])).toEqual([
      { relationTo: 'users', id: 7 },
    ])
  })

  it('handles a populated document', () => {
    expect(normalizeRefs({ id: 42, label: 'x' }, 'tenantCanaries')).toEqual([
      { relationTo: 'tenantCanaries', id: 42 },
    ])
  })

  it('ignores null and undefined instead of inventing a reference', () => {
    expect(normalizeRefs(null, 'tenantCanaries')).toEqual([])
    expect(normalizeRefs([null, undefined], 'tenantCanaries')).toEqual([])
  })
})

describe('sameTenant composes with Payload\'s default validator, it does not replace it', () => {
  /** Same shape as the sibling block's helper; redeclared because that one is block-scoped. */
  const opts = (tenant: unknown, relationTo = 'tenantCanaries') => ({
    siblingData: { tenant },
    data: { tenant },
    name: 'related',
    relationTo,
  })

  /**
   * **A declared `validate` REPLACES the default; it does not compose with it** — measured in
   * Payload 3's `sanitize.js`. `required: true` on a relationship is enforced by
   * `validations.relationship` and by nothing else, so attaching a bare `sameTenant` to a
   * required field silently made `required` inert: a null value returned `true`, and the only
   * remaining backstop was a Postgres NOT NULL error, which surfaces as a database failure
   * rather than a field-level message — if the column is even NOT NULL yet.
   *
   * The first collision was `projeto.categoria`, declared `required: true` and marked
   * obrigatório in `projetos.md`. It will not be the last: this validator goes on every scoped
   * relationship in the feature, and twelve more collections copy that template.
   */
  it('refuses an empty value on a REQUIRED relationship', async () => {
    const result = await sameTenant(null, { ...opts(world.orgA.id), required: true } as never)
    expect(
      result,
      'a required relationship accepted null. `required` is enforced by the default validator ' +
        'that a declared `validate` replaces, so attaching sameTenant switched it off.',
    ).not.toBe(true)
  })

  it('still passes an empty value on an OPTIONAL relationship', async () => {
    // The pair: without it, refusing every empty value would break every optional relation in
    // the feature, which is a louder failure but just as wrong.
    await expect(sameTenant(null, opts(world.orgA.id))).resolves.toBe(true)
  })

  it('still refuses a cross-tenant ref when the field is required', async () => {
    // The tenant check must survive the composition rather than being short-circuited by it.
    const result = await sameTenant(world.rows.tenantCanaries!.B, {
      ...opts(world.orgA.id),
      required: true,
    } as never)
    expect(result).toMatch(/outra organização/)
  })
})
