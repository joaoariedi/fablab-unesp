import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { themeStyle } from '../lib/theme'

/**
 * T013 / FR-003, FR-004, FR-019 — `themeStyle()` returns a React **style object**, never a
 * `<style>` string, and refuses any value that is not a strict hex.
 *
 * ── Why both halves are asserted here, and in this order ────────────────────────────────
 *
 * The two defences are not equals, and the task wording is deliberate about which is which:
 * **the regex is the primary defence; the object only limits blast radius.** React does not
 * sanitise custom properties — in SSR it emits `style="--color-primary:VALUE"`, so a stored
 * value of `red; display:none` still injects a *second declaration* on `<body>`. It is
 * element-scoped rather than a stylesheet break-out, which is smaller, but it is not nothing.
 *
 * Asserting only the return shape would therefore ship a green suite over an injectable
 * function; asserting only the regex would let a later refactor swap the object for a
 * `<style>` string — a full stylesheet break-out for anything the regex ever misses. So:
 * the injection payloads (§2) carry the security claim, and the shape assertions (§1, §3)
 * stop the containment layer from being traded away for a string.
 */

/** An organization record as the layout hands it over. Deliberately as loose as the real
 *  one: these values arrive from the database, not from a caller a type could constrain. */
type OrgRecord = { theme?: { primaryColor?: unknown } } | null | undefined

/**
 * Payloads that break out of a `--color-primary` declaration. Each one is a *valid prefix* —
 * it starts with something a lazy check would accept — so a guard that only tests for
 * emptiness, or only strips `<`, lets every one of them through.
 */
const INJECTION_PAYLOADS: ReadonlyArray<{ label: string; value: string }> = [
  {
    label: 'a second declaration appended to a real hex',
    value: '#EE9DC4; display:none',
  },
  {
    label: 'a rule break-out targeting body',
    value: 'red;}body{display:none',
  },
  {
    label: 'a closing style tag, which would end a <style> block',
    value: '#EE9DC4</style><script>alert(1)</script>',
  },
  {
    label: 'an attribute break-out with an event handler',
    value: '#EE9DC4" onload="alert(1)',
  },
  {
    label: 'a url() pulling a remote asset',
    value: '#EE9DC4;background:url(https://evil.example/x)',
  },
  {
    label: 'a newline-separated second declaration',
    value: '#EE9DC4;\nposition:fixed',
  },
]

const THEME_SOURCE = join(import.meta.dirname, '..', 'lib', 'theme.ts')

describe('T013 / FR-003, FR-004, FR-019 — themeStyle() publishes a style object, not CSS text', () => {
  describe('§1 — the return value is a React style object', () => {
    it('returns a plain object keyed by the custom property, not a string of CSS', () => {
      const style = themeStyle({ theme: { primaryColor: '#3760AA' } })

      expect(
        typeof style,
        'themeStyle() returned something other than an object. A string return means the ' +
          'caller has to interpolate it into markup — a <style> block or a style attribute — ' +
          'and every character of the value is then live CSS rather than a React-managed ' +
          'property value.',
      ).toBe('object')
      expect(style).not.toBeNull()
      expect(Array.isArray(style)).toBe(false)
      expect(style).toEqual({ '--color-primary': '#3760AA' })
    })

    it('publishes exactly one property, so no second token can ride along', () => {
      const style = themeStyle({ theme: { primaryColor: '#3760AA' } }) as Record<string, unknown>

      expect(
        Object.keys(style),
        'FR-003 makes exactly one colour token per-organization. Any additional key here is ' +
          'a platform-fixed colour becoming per-tenant without a requirement saying so.',
      ).toEqual(['--color-primary'])
    })

    it('hands back a fresh object per call, never a shared module-level one', () => {
      const first = themeStyle({ theme: { primaryColor: '#3760AA' } }) as Record<string, unknown>
      const second = themeStyle({ theme: { primaryColor: '#3760AA' } }) as Record<string, unknown>

      expect(
        first,
        'themeStyle() reuses one object across calls. Under SSR that object is shared by ' +
          'concurrent requests for different organizations, so a mutation by one renderer ' +
          "leaks into another tenant's page.",
      ).not.toBe(second)
      expect(first).toEqual(second)
    })

    it('produces string values only, which is all React will accept for a custom property', () => {
      const style = themeStyle({ theme: { primaryColor: '#eee' } }) as Record<string, unknown>

      for (const [key, value] of Object.entries(style)) {
        expect(typeof key).toBe('string')
        expect(
          typeof value,
          `--color-primary was published as a ${typeof value}. React appends a unit to ` +
            'numeric style values, so a non-string here reaches the DOM altered.',
        ).toBe('string')
      }
    })
  })

  describe('§2 — the regex is the primary defence (FR-019)', () => {
    it.each(INJECTION_PAYLOADS)('refuses $label', ({ value }) => {
      const style = themeStyle({ theme: { primaryColor: value } })

      // The whole return, not just `style['--color-primary']`. Reading one property would
      // pass vacuously against any non-object return — a `<style>` string has no such
      // property either — which is exactly the shape this task forbids.
      expect(
        style,
        `themeStyle() let ${JSON.stringify(value)} through to CSS. React does not sanitise ` +
          'custom properties: this value is emitted verbatim into style="--color-primary:…" ' +
          'and the trailing declaration lands on <body>.',
      ).toBeUndefined()

      // Belt and braces: whatever came back, the payload must not survive anywhere inside it.
      expect(JSON.stringify(style ?? null)).not.toContain(value)
    })

    it('accepts both hex lengths and nothing else that CSS would also take', () => {
      expect(themeStyle({ theme: { primaryColor: '#eee' } })).toEqual({ '--color-primary': '#eee' })
      expect(themeStyle({ theme: { primaryColor: '#EE9DC4' } })).toEqual({
        '--color-primary': '#EE9DC4',
      })

      // Valid CSS, still refused: a narrow shape is the only one that can be checked, and
      // every stored value is written by the theme editor.
      for (const wider of ['red', 'rgb(0 0 0)', '#EE9DC4AA', 'var(--x)']) {
        expect(
          themeStyle({ theme: { primaryColor: wider } }),
          `${wider} was accepted. Widening the accepted shape widens what an injection can hide in.`,
        ).toBeUndefined()
      }
    })

    it('declines to publish anything at all for an untrusted theme (FR-004)', () => {
      const untrusted: ReadonlyArray<OrgRecord> = [null, undefined, {}, { theme: {} }]

      for (const org of untrusted) {
        expect(() => themeStyle(org)).not.toThrow()
        expect(
          themeStyle(org),
          'themeStyle() published a style object for a theme it cannot trust. Returning ' +
            'undefined is the fallback itself: palette.css already declares the CITe pink, ' +
            'so publishing no override is what renders the default.',
        ).toBeUndefined()
      }
    })
  })

  describe('§3 — the source never builds CSS text', () => {
    /**
     * The shape assertions above are satisfied by any function that happens to return an
     * object today. This reads the module itself, because the failure being guarded against
     * is a *future* edit that reintroduces a string — and that edit's own test would be
     * written against whatever it produces.
     */
    it('contains no <style> block and no dangerouslySetInnerHTML', () => {
      const source = readFileSync(THEME_SOURCE, 'utf8')

      expect(
        source,
        'lib/theme.ts builds a <style> element. A stored value inside a <style> block is a ' +
          'stylesheet break-out, not an element-scoped one — strictly worse than the style ' +
          'attribute this task mandates.',
      ).not.toMatch(/<\s*\/?\s*style/i)

      expect(
        source,
        'lib/theme.ts reaches for dangerouslySetInnerHTML, which is markup injection by name.',
      ).not.toMatch(/dangerouslySetInnerHTML/)
    })
  })
})
