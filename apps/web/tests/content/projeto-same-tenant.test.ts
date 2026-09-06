import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { isScoped } from '../../lib/tenancy/scope-registry'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T026 / FR-007 — every relationship on `projeto` whose target is a **scoped** collection
 * carries the shared same-tenant validator.
 *
 * Spike S4c measured the hole this closes: the multi-tenant plugin accepted a row in
 * organization A pointing at a row in organization B, and the write *succeeded*. The
 * validator's own behaviour is proven against a live database in
 * `tests/tenancy/relationships.test.ts`; what is asserted here is that `projeto` is actually
 * wired to it — a guard nobody attached is a guard that does not run.
 *
 * The general assertion is deliberately the one that carries the requirement. `categoria` is
 * the only scoped edge this collection declares **today**; `autor` → `perfilMaker` (T042) and
 * `maquinasUtilizadas` → `estacao` (feature 005, FR-022) land with their target collections,
 * and the loop below fails the moment either arrives without the validator instead of waiting
 * for someone to remember to extend this file.
 *
 * Identity (`toBe(sameTenant)`), not merely "is a function": FR-007 says the **shared**
 * validator, and a hand-rolled inline reimplementation on one collection is exactly the drift
 * that makes a tenancy guarantee stop holding somewhere nobody looks.
 *
 * Config-shape only: no database, like `projeto.test.ts` and `registry.test.ts`.
 */

const SLUG = 'projeto'

type RelationshipField = {
  name: string
  type: string
  relationTo?: string | string[]
  validate?: unknown
}

const collectionConfig = async () => {
  const config = await configPromise
  return config.collections.find((c) => c.slug === SLUG)
}

/** Both shapes Payload allows: a single target, or a polymorphic list of them. */
const targetsOf = (field: RelationshipField): string[] =>
  Array.isArray(field.relationTo) ? field.relationTo : field.relationTo ? [field.relationTo] : []

/**
 * Every relationship field pointing at a collection the registry declares `scoped`.
 *
 * `flattenedFields` rather than `fields` so a relationship nested in a group or an array is
 * not silently exempt — `sameTenant` reads `data.tenant` precisely so it works in that
 * position, and a test that only walked the top level would not notice one hiding there.
 */
const scopedRelationships = async (): Promise<RelationshipField[]> => {
  const collection = await collectionConfig()
  const fields = (collection?.flattenedFields ?? []) as unknown as RelationshipField[]

  return fields.filter((f) => f.type === 'relationship' && targetsOf(f).some(isScoped))
}

describe('projeto guards every scoped relationship with sameTenant (T026, FR-007)', () => {
  it('declares at least one scoped relationship, so the loop below has a subject', async () => {
    // Without this, a refactor that renamed or dropped `categoria` would turn the assertion
    // that follows into a vacuous pass over an empty list.
    const names = (await scopedRelationships()).map((f) => f.name)

    expect(names, 'projeto declares no relationship to a scoped collection').toContain('categoria')
  })

  it('attaches the shared validator to each of them', async () => {
    for (const field of await scopedRelationships()) {
      expect(
        field.validate,
        `${SLUG}.${field.name} points at the scoped collection(s) ` +
          `${targetsOf(field).join(', ')} with no same-tenant guard: a project could be ` +
          "written pointing at another lab's row, which spike S4c proved the plugin allows",
      ).toBe(sameTenant)
    }
  })

  it('leaves relationships to global collections alone', async () => {
    // The plugin-injected `tenant` field points at `organizations`, which is global — "same
    // tenant" is not a meaningful question for it, and guarding it would make the validator
    // compare the tenant to itself on every write.
    const collection = await collectionConfig()
    const fields = (collection?.flattenedFields ?? []) as unknown as RelationshipField[]
    const tenantField = fields.find((f) => f.name === 'tenant')

    expect(tenantField, 'projeto is not tenant-stamped by the plugin').toBeDefined()
    expect(tenantField?.validate).not.toBe(sameTenant)
  })
})
