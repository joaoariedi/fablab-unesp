# @fablab/ui

Identity tokens and the base component set (card, chip, XP pips, buttons).

## The rule that makes co-branding cheap

Constitution, Principle 4 — *Design and content fidelity*:

> Identity values are **CSS custom properties** resolved from the organization record:
> **zero hexadecimal literals in components.**

This is not a style preference. Each organization carries its own `theme` (primary colour,
logo, hero image), and the platform renders every one of them from the same components. A
single `#RRGGBB` written into a component is a tenant's identity hard-coded into shared
code — it works until the second organization exists, which is precisely the failure feature
000 exists to prevent structurally.

The pixel art (avatar, icons, stations) is **shared** across organizations. v1 is
co-branding, not white-label: full visual identity per lab would need a designer per lab.

## The public surface

Four subpaths, and nothing else is reachable — the export map has no deep paths, so a module
the barrels do not re-export has **no legal import in the product**:

```ts
import { Button, Card, HeaderNav, MobileTabBar } from '@fablab/ui'
import { Card } from '@fablab/ui/components'
import { PALETTE, DOCUMENTED_PAIRS, contrastRatio } from '@fablab/ui/tokens'
import '@fablab/ui/styles.css'   // once, in the app's root layout
```

That is not a documentation nicety. Five components once shipped complete, tested and
unreachable, because each test imported its component by relative path and never touched the
public surface; the whole shell shipped the same way behind an `export {}` placeholder.
`tests/component-barrel.test.ts` now derives the expectation from the directory, so a
component added tomorrow is covered with no edit.

## What ships here

| | |
|---|---|
| **Tokens** | palette, typography (two faces + the `--text-*` scale), layout (breakpoints, spacing, radii, the hard shadow) |
| **Components** | `Button` `Card` `Chip` `LogoChip` `PixelImage` `ProgressBar` `SearchInput` `SkillPips` `Tabs` |
| **Shell** | `HeaderNav` `MobileTabBar` `MenuSheet` `Footer`, with the tab sets as data in `shell/tabs.ts` |
| **Shapes** | the isometric vocabulary (`IsoShape`) |

`--color-primary` is the **only** token an organization sets. Everything else is
platform-fixed, and `--color-rosa-raw` — the private default behind it — is rejected by lint
in components, because a CTA painted with the raw pink renders *identically* for CITe and
fails to co-brand only once a second organization exists.

## Constraints this package keeps

- **No React dependency** — React is a *peer*; the app owns the instance. A second copy
  makes every hook throw "Invalid hook call", which no test here can see because none render.
- **No build step** — `exports` points at TypeScript source and Next transpiles it via
  `transpilePackages`.
- **No IO, no Payload, no Next server APIs** in `src/**` (FR-018), enforced in
  `eslint.config.mjs`: Node builtins are derived from `module.builtinModules` and Next is
  deny-by-default except `next/link` and `next/image`.
- **No component renders in a test.** There is no DOM environment and none is added
  (CLR-003), so the suites assert data, arithmetic and file text. Rendering is checked by the
  workbench at `/workbench` and, later, by feature 003's Playwright. **Green CI here does not
  mean visually correct.**
