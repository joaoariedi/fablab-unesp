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

## Status in feature 000

**Placeholder.** Feature 001 (design system) fills this package with the tokens and
components taken from the mockups in `docs/product/`. It exists now so that feature 001 can
start in parallel against a workspace that already resolves — which is the whole reason the
skeleton merges before the guardrails finish (spec decision 5).
