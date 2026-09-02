import type { CSSProperties } from 'react'

/**
 * Per-organization theming, as a React `style` object (FR-003, FR-004, FR-019, CLR-004).
 *
 * Exactly one token varies per organization — `--color-primary` — and this is the second of
 * CLR-004's two validation checkpoints: the first is the `validate` on the collection field
 * (`collections/Organizations.ts`), this one is the last thing standing between a stored
 * value and the stylesheet.
 *
 * **The regex is the primary defence; the object only limits blast radius.** React does not
 * sanitise custom properties: in SSR it emits `style="--color-primary:VALUE"`, so a value of
 * `red; display:none` still injects a second declaration on `<body>`. That is element-scoped
 * rather than a stylesheet break-out — smaller, but not nothing. Stating it the other way
 * round is how the validation gets "simplified away" later on the belief that React handles
 * it; feature 000 mutation-tested this exact question and found two of three layers removable
 * with the harness still green.
 *
 * The corollary is the one thing this module must never do: build CSS *text*. A style
 * element, or any string interpolated into markup, upgrades a value the regex ever misses
 * from an element-scoped declaration to a full stylesheet break-out. The T013 test asserts
 * that by scanning this source for a style tag — so the tag is spelled out nowhere here, not
 * even in prose.
 */

/** A strict hex colour — `#RGB` or `#RRGGBB`, nothing else. Anything CSS would also accept
 *  (`red`, `rgb(…)`, `#RRGGBBAA`, `var(--x)`) is refused: a narrow shape is the only one that
 *  can be checked, and every value this platform stores is written by the theme editor. */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * The `style` object carrying an organization's accent, or `undefined` when the record has no
 * trustworthy colour to publish.
 *
 * Returning `undefined` *is* the fallback: `packages/ui/src/tokens/palette.css` already
 * declares `--color-primary` as the CITe pink, so a page that publishes no override is
 * correctly branded with no second code path to keep in sync (FR-004). Absent, empty and
 * malformed themes therefore converge here rather than each needing a default of their own.
 *
 * The object literal is rebuilt per call on purpose. A module-level constant would be shared
 * by concurrent SSR renders for different organizations, where one renderer's mutation leaks
 * into another tenant's page.
 *
 * @example themeStyle({ theme: { primaryColor: '#3760AA' } }) // { '--color-primary': '#3760AA' }
 */
export function themeStyle(
  org: { theme?: { primaryColor?: unknown } } | null | undefined,
): CSSProperties | undefined {
  const colour = org?.theme?.primaryColor
  if (typeof colour !== 'string') return undefined

  // Tested as stored, NOT trimmed first (T014/SC-011). Trim-then-validate widens this
  // checkpoint past the one on the collection field, which refuses padded input outright —
  // and the whole value of CLR-004's two checks is that the second is the *last* refusal,
  // never a looser one. A value needing a trim did not come through the field validator, so
  // it arrived by a route nobody vetted (a seed script, a migration, direct SQL); silently
  // normalising it and publishing it is exactly the acceptance this layer exists to deny.
  if (!HEX.test(colour)) return undefined

  // Cast, not a plain annotation: CSSProperties has no index signature for custom properties,
  // so a `--`-prefixed key is a type error without it. The value is already proven hex above.
  return { '--color-primary': colour } as CSSProperties
}
