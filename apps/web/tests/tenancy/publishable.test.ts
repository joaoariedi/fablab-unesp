import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { derivePublishable } from '../../lib/tenancy/public-payload'
import { isScoped } from '../../lib/tenancy/scope-registry'

/**
 * The publishable set is **derived, never listed** (T010, FR-010, CHK046).
 *
 * A hand-kept list rots in one direction only, and it is the dangerous one: a collection
 * that *gains* `status` and is forgotten here is served to anonymous visitors with no
 * published-only filter at all — drafts and in-review rows, publicly, silently. So the set
 * is computed from the collection configs, and this file is the gate that says the
 * computation agrees with the configs, in both directions.
 *
 * Config-shape only: no database, like `registry.test.ts`.
 */

/** Minimal field shape the fixtures below build; mirrors what Payload sanitizes to. */
type Field = {
  name?: string
  type: string
  fields?: Field[]
  tabs?: { name?: string; fields: Field[] }[]
}

const collection = (slug: string, fields: Field[]) => ({ slug, fields })

const statusField: Field = { name: 'status', type: 'select' }

describe('derivePublishable, against the real Payload config', () => {
  /**
   * The independent route. The implementation walks `fields` itself; this walks Payload's
   * own `flattenedFields`, which is the list of names a `where` clause can actually address.
   * Two routes to the same answer is the whole point — a test that re-ran the
   * implementation's own logic would agree with any bug it contained.
   */
  it('is exactly the scoped collections whose config declares a queryable status', async () => {
    const config = await configPromise
    const expected = config.collections
      .filter((c) => isScoped(c.slug))
      .filter((c) => c.flattenedFields.some((f) => f.name === 'status'))
      .map((c) => c.slug)
      .sort()

    const derived = [...derivePublishable(config.collections)].sort()

    expect(
      derived,
      'PUBLISHABLE disagrees with the collection configs. A collection that gained `status` ' +
        'and is missing here is served to anonymous readers unfiltered — drafts included.',
    ).toEqual(expected)
  })

  it('excludes a global collection that declares a status of its own', async () => {
    const config = await configPromise
    const organizations = config.collections.find((c) => c.slug === 'organizations')

    // Non-vacuity guard: this assertion only means something while `organizations` really
    // does carry a `status` (it does — `active | suspended`), and it is global.
    expect(organizations?.flattenedFields.some((f) => f.name === 'status')).toBe(true)
    expect(isScoped('organizations')).toBe(false)

    expect(
      derivePublishable(config.collections).has('organizations'),
      "filtering organizations on status='publicado' would match nothing and hide every " +
        "organization from the anonymous theme read (feature 001, FR-003).",
    ).toBe(false)
  })
})

describe('derivePublishable, on collection configs', () => {
  it('includes a scoped collection that declares status', () => {
    const derived = derivePublishable([
      collection('tenantCanaries', [{ name: 'label', type: 'text' }, statusField]),
    ])
    expect(derived.has('tenantCanaries')).toBe(true)
  })

  it('excludes a scoped collection that declares no status', () => {
    const derived = derivePublishable([collection('tenantCanaries', [{ name: 'label', type: 'text' }])])
    expect(
      derived.has('tenantCanaries'),
      'a collection with no status was filtered on one, which matches zero rows — the ' +
        'public site would show nothing at all',
    ).toBe(false)
  })

  it('finds a status declared inside a presentational row', () => {
    // A `row` is layout, not data: Payload flattens it away, so this `status` is queryable
    // as `status` exactly like a top-level one. Missing it fails open — the collection drops
    // out of PUBLISHABLE and its drafts go public.
    const derived = derivePublishable([
      collection('tenantCanaries', [
        { type: 'row', fields: [{ name: 'titulo', type: 'text' }, statusField] },
      ]),
    ])
    expect(
      derived.has('tenantCanaries'),
      'a status inside a row was missed, so the collection is served with no published-only ' +
        'filter — drafts and in-review rows, publicly',
    ).toBe(true)
  })

  it('finds a status declared inside an unnamed tab', () => {
    const derived = derivePublishable([
      collection('tenantCanaries', [
        { type: 'tabs', tabs: [{ fields: [statusField] }] },
      ]),
    ])
    expect(derived.has('tenantCanaries')).toBe(true)
  })

  it('finds a status declared inside an UNNAMED group (regression)', () => {
    // The case the hand-rolled walk missed. Payload's `fieldAffectsData` is false for a group
    // with no `name`, so its children are spliced into the parent and this `status` really is
    // queryable as `status` — but the walk enumerated `row`, `collapsible` and unnamed `tabs`
    // only, and answered false. Under the old client that was a public dump of every draft;
    // under the current one it is a refusal of a collection that should be readable. Either
    // way the derivation was wrong, and enumerating wrappers is what made it wrong — the
    // derivation now asks Payload's own `flattenAllFields` instead of re-deriving the rule.
    const derived = derivePublishable([
      collection('tenantCanaries', [
        { type: 'group', fields: [{ name: 'titulo', type: 'text' }, statusField] },
      ]),
    ])
    expect(
      derived.has('tenantCanaries'),
      'a status inside an unnamed group was missed — Payload flattens it, so the field is ' +
        'queryable as `status` and the collection is publishable',
    ).toBe(true)
  })

  it('does not count a `ui` field named status, which Payload never persists', () => {
    // The mirror of the case above, and it fails in the other direction: `ui` fields are
    // excluded from `flattenedFields`, so filtering on one would match zero rows and empty
    // the public listing.
    const derived = derivePublishable([
      collection('tenantCanaries', [{ name: 'status', type: 'ui' } as never]),
    ])
    expect(
      derived.has('tenantCanaries'),
      'a `ui` field named status was treated as queryable; the filter would match nothing',
    ).toBe(false)
  })

  it('does not mistake a status nested under a named group for a queryable one', () => {
    // `meta.status` is a different field: `{ status: { equals: 'publicado' } }` would never
    // match it, so treating the collection as publishable would empty its public listing.
    const derived = derivePublishable([
      collection('tenantCanaries', [{ name: 'meta', type: 'group', fields: [statusField] }]),
    ])
    expect(
      derived.has('tenantCanaries'),
      'a nested `meta.status` was read as a top-level `status`; the published-only filter ' +
        'would match zero rows',
    ).toBe(false)
  })

  it('ignores an unregistered or global slug even when it declares status', () => {
    const derived = derivePublishable([
      collection('organizations', [statusField]),
      collection('naoRegistrada', [statusField]),
    ])
    expect([...derived]).toEqual([])
  })
})
