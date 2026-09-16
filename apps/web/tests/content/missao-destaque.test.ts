import type { FlattenedField } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '../../payload.config'

/**
 * T005 / FR-001 — the **config-shape gate** for the two curation fields, read from the
 * *sanitized* config.
 *
 * `missao-config.test.ts` already asserts these two fields against the exported
 * `Missao` object. This file deliberately asserts something that one cannot: the shape that
 * **actually runs**. Between the source export and the sanitized config sit three steps that
 * each decide whether a field is real —
 *
 *  - **registration.** A collection that never reaches `payload.config.ts`'s `collections`
 *    array still exports perfectly good fields. Every assertion against the source export
 *    passes on a collection the application does not have.
 *  - **the multi-tenant plugin**, which rewrites the collections it is given (the injected
 *    `tenant` field below is its fingerprint, and is the reason this file cannot silently be
 *    reading the source export).
 *  - **`sanitizeFields`**, which normalises what the field carries — `required` is absent
 *    rather than `false` on `ordemDestaque` after it runs, so *"optional"* has to be asserted
 *    as falsy-or-absent against this object, not as `=== false`.
 *
 * And it is the sanitized shape the band's read is resolved against. `flattenedFields` is the
 * set of names a `where` clause and a `sort` key can address: T020 queries
 * `where: { destaqueHome: { equals: true } }` and `sort: ['ordemDestaque', 'titulo']`, and a
 * sort key drizzle cannot resolve to a column does **not** raise — the local API swallows it
 * and falls back to `-createdAt`. The band would then be the three most recently created
 * missions, with nothing on screen or in a log to say so. That silent failure is what these
 * assertions exist to convert into a red test.
 *
 * Read from the config object only — never from the source text. A gate that greps
 * `collections/content/Missao.ts` asserts that someone typed a word in a file; this asserts
 * that Payload built the field.
 *
 * No database: `buildConfig` resolves without one, exactly as `registry.test.ts` relies on.
 */

/** The sanitized `missao`, or a failure that names what is missing rather than `undefined`. */
const missaoColecaoSanitizada = async () => {
  const config = await configPromise
  const missao = config.collections.find((c) => c.slug === 'missao')

  expect(
    missao,
    'the sanitized config carries no `missao` collection: the collection is unregistered in ' +
      'payload.config.ts, so every assertion made against the exported object describes a ' +
      'collection the application does not have',
  ).toBeDefined()

  return missao as NonNullable<typeof missao>
}

/** A sanitized field by name, from the flattened set — the names a query can address. */
const campoSanitizado = async (name: string): Promise<FlattenedField | undefined> =>
  (await missaoColecaoSanitizada()).flattenedFields.find((f) => f.name === name)

/**
 * `required` read through an `in` narrowing rather than a cast.
 *
 * Payload declares the flag on the individual field types, never on the `FlattenedField` union
 * — `field.required` does not typecheck against the union, and a `as { required?: boolean }`
 * would make this gate pass on a field shape that has no such concept at all. The narrowing
 * keeps the compiler as the first assertion: a field type that cannot be required reads as
 * `undefined` here, which is what "optional" means for `ordemDestaque` below.
 */
const obrigatoriedadeDe = (campo: FlattenedField | undefined): boolean | undefined =>
  campo !== undefined && 'required' in campo ? campo.required : undefined

describe('missao carries FR-001\'s curation fields in the config Payload actually builds (T005)', () => {
  it('is the SANITIZED config, proven by the tenant field only the plugin injects', async () => {
    // The guard for this whole file. `Missao.ts` declares no `tenant` — `missao-config.test.ts`
    // asserts that it must not, because a hand-declared one collides with the plugin's. So
    // `tenant` appearing here is proof that what follows is the post-plugin, post-sanitize
    // shape and not the source export wearing its name. If this ever fails, every other
    // assertion in the file has quietly become a weaker test.
    expect(
      (await missaoColecaoSanitizada()).flattenedFields.map((f) => f.name),
      'no `tenant` in the sanitized missao: the multi-tenant plugin did not process this ' +
        'collection, so this file is no longer asserting against the config that runs',
    ).toContain('tenant')
  })

  it('exposes both curation names to a query — where(destaqueHome) and sort(ordemDestaque)', async () => {
    const names = (await missaoColecaoSanitizada()).flattenedFields.map((f) => f.name)

    expect(
      names,
      'destaqueHome is not addressable in the sanitized config: the band\'s ' +
        '`where: { destaqueHome: { equals: true } }` matches nothing and MISSÕES EM DESTAQUE ' +
        'renders its empty state on a lab that curated three missions (FR-001)',
    ).toContain('destaqueHome')
    expect(
      names,
      'ordemDestaque is not addressable in the sanitized config: `sort: [\'ordemDestaque\', ' +
        '\'titulo\']` resolves no column, and the local API swallows that failure and falls ' +
        'back to `-createdAt` — the band silently becomes the three newest missions (FR-003)',
    ).toContain('ordemDestaque')
  })
})

describe('destaqueHome, as built: a required boolean that starts false (T005, FR-001)', () => {
  it('is a checkbox — the type the band\'s `equals: true` is written against', async () => {
    expect(
      (await campoSanitizado('destaqueHome'))?.type,
      'destaqueHome is missing or is not a checkbox in the built config: the team has no ' +
        'curation switch and the band has nothing to filter on (FR-001)',
    ).toBe('checkbox')
  })

  it('is required, so no mission answers null to `destaqueHome: { equals: true }`', async () => {
    // Required survives sanitization as a literal `true`, so it is asserted as one. A row
    // carrying null would be a third state between featured and not featured: invisible to
    // `equals: true` and invisible to a `not_equals` audit alike, which is a mission missing
    // from the band with nothing to point at.
    expect(
      obrigatoriedadeDe(await campoSanitizado('destaqueHome')),
      'destaqueHome is not required in the built config: a mission can carry null, a third ' +
        'state between featured and not that no query can name (FR-001)',
    ).toBe(true)
  })

  it('defaults to false — curation is a choice the team makes, never one it omits', async () => {
    // **Measured, so nobody re-derives it from the mutation that survives.** Deleting
    // `defaultValue: false` from the source does NOT turn this red, and that is not a weak
    // assertion — it is the sanitized config doing its job: `sanitize.js:75-77` reads
    // `field.type === 'checkbox' && typeof field.defaultValue === 'undefined' && field.required
    // === true` and back-fills `false` (verified in payload 3.88.0). On the built config the
    // required flag and the default are therefore entangled, and what this line asserts is the
    // **guarantee**, not the literal: whatever the source says, no mission is ever created
    // featured. It goes red on `defaultValue: true`, and on a field that is neither required
    // nor defaulted — the two ways the guarantee can actually be lost.
    //
    // `.toBe(false)` and not `.toBeFalsy()`: `undefined` is falsy too, and it is precisely the
    // undefined case — no required flag to trigger the back-fill — that must not pass here.
    expect(
      (await campoSanitizado('destaqueHome'))?.defaultValue,
      'destaqueHome does not default to false in the built config: a mission created without ' +
        'an opinion arrives featured on the Home, which is curation by omission (FR-001)',
    ).toBe(false)
  })
})

describe('ordemDestaque, as built: an optional number with no default (T005, FR-001, FR-003)', () => {
  it('is a number — the key the band orders on, ascending', async () => {
    expect(
      (await campoSanitizado('ordemDestaque'))?.type,
      'ordemDestaque is missing or is not a number in the built config: the team cannot say ' +
        'which featured mission comes first (FR-001, FR-003)',
    ).toBe('number')
  })

  it('is OPTIONAL — featuring one mission must not demand a position for it', async () => {
    // Sanitization leaves `required` absent rather than `false` on a field that never declared
    // it, so the assertion is falsy-or-absent by construction. Postgres sorts NULLs last on
    // ASC, so an unpositioned featured mission falls behind the positioned ones and the
    // `titulo` tie-break settles the rest — the band stays deterministic without the number.
    expect(
      obrigatoriedadeDe(await campoSanitizado('ordemDestaque')),
      'ordemDestaque is required in the built config: ticking Destaque na Home now also ' +
        'demands a number, and the team must invent a position for a band of one (FR-001)',
    ).toBeFalsy()
  })

  it('carries no defaultValue, so "no opinion" stays distinguishable from "first"', async () => {
    // Asserted as an absent KEY, not as `undefined`: `defaultValue: undefined` would read the
    // same through `?.defaultValue` while being a declaration someone wrote. Every row sharing
    // one position collapses the band onto the `titulo` tie-break and silently retires the
    // field the editor is being asked to fill in.
    const ordem = await campoSanitizado('ordemDestaque')

    expect(
      ordem !== undefined && 'defaultValue' in ordem,
      'ordemDestaque declares a defaultValue in the built config: every mission arrives ' +
        'sharing one position, so the order the team set is indistinguishable from the order ' +
        'it never set (FR-003)',
    ).toBe(false)
  })
})
