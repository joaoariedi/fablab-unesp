import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'
import { sameTenant } from '../../lib/tenancy/same-tenant-validator'

/**
 * T039 / FR-034, CLR-002 — `projeto` names its author, and the column can hold nothing.
 *
 * `projeto` shipped in 002 with no `autor` at all: `perfilMaker` did not exist yet, and Payload
 * throws at config load for a relationship whose target is missing. The profile landed in this
 * feature, so the byline every card renders can finally point at a row instead of the
 * `AUTORIA_PENDENTE` placeholder T041 deletes.
 *
 * **Nullable on day one, and that is the whole point of asserting it here.** Feature 004 paid
 * for the other order on `artigo`, `aula` and `modelo3d`: `required: true` had to be undone in
 * *two* places at once, because
 *
 *   - `push` is on for every non-production database (`payload.config.ts`) and
 *     `@payloadcms/drizzle` derives a column's `notNull` from the field's `required`, so the
 *     migration that dropped the NOT NULL was silently reverted by the next boot; and
 *   - a declared `validate` REPLACES Payload's default, and `sameTenant` re-implements the
 *     `required` floor itself, so `{ autor: null }` was refused by the application even where
 *     the column allowed it.
 *
 * Declaring it optional now costs nothing and spares this collection both. It is not a
 * relaxation of editorial policy: the admin and the review queue still want an author before
 * anything is published. What the schema must be able to express is the one state that has no
 * author *by design* — work whose author asked to be erased (FR-031, CLR-003).
 *
 * The same-tenant guard is asserted by name as well, although
 * `projeto-same-tenant.test.ts` sweeps every scoped relationship on this collection: that loop
 * proves the *class*, this proves FR-034's own field, and the failure message tells the reader
 * which of the two guarantees they just broke.
 *
 * Config-shape only: no database, like `projeto.test.ts` and `projeto-same-tenant.test.ts`.
 * The database's side of the same promise is `tests/tenancy/autor-nulavel.test.ts`, which asks
 * `information_schema` after a real boot.
 */

const SLUG = 'projeto'

const fieldNamed = async (name: string) => {
  const config = await configPromise
  const collection = config.collections.find((c) => c.slug === SLUG)
  return collection?.flattenedFields.find((f) => f.name === name) as
    | Record<string, unknown>
    | undefined
}

describe('projeto.autor (T039, FR-034)', () => {
  it('exists, so the card byline has a row to render', async () => {
    expect(
      await fieldNamed('autor'),
      'projeto declares no autor. Every project card renders AUTORIA_PENDENTE until it does, ' +
        'and creditOnApproval reads doc.autor to credit XP — with no field it credits nobody.',
    ).toBeDefined()
  })

  it('points at perfilMaker, not at the global usuario (CLR-002)', async () => {
    // projetos.md says "relação → usuario", written before CLR-002 split identity from
    // profile. Level, XP and skills are per-organization, so one person making at two labs has
    // one login and two profiles; the author block on the card renders the profile.
    expect((await fieldNamed('autor'))?.relationTo).toBe('perfilMaker')
  })

  it('is NOT required, so an erased author is a state the row can hold (CLR-002, CLR-003)', async () => {
    const autor = await fieldNamed('autor')

    // Without this, `undefined?.required` is undefined — falsy — and the assertion below would
    // report the absent field as a correctly optional one.
    expect(autor, 'the collection declares no autor at all, so the check below is vacuous').toBeDefined()
    expect(
      autor?.required,
      'projeto.autor is required. `push` derives the column\'s NOT NULL from this flag and ' +
        '`sameTenant` re-implements the required floor, so undoing it later costs a migration ' +
        'AND a config change — exactly the repair feature 004 paid for on artigo, aula and ' +
        'modelo3d. Until both are undone, nulling the byline fails mid-transaction and the ' +
        'whole erasure rolls back: a person who asked to be forgotten stays.',
    ).toBeFalsy()
  })

  it('carries the shared same-tenant validator (FR-007)', async () => {
    expect(
      (await fieldNamed('autor'))?.validate,
      'projeto.autor points at the scoped collection perfilMaker with no same-tenant guard: a ' +
        "project could be written naming another lab's maker, which spike S4c proved the " +
        'plugin allows. The shared validator, never a local reimplementation.',
    ).toBe(sameTenant)
  })
})
