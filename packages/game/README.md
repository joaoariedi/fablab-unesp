# @fablab/game

The XP, level and mission rules as **plain TypeScript**.

## What this package may not do

Constitution, Principle 3 — *Pure game rules over an immutable ledger*:

- **No Payload imports.** Not the client, not the types, not a helper. This is enforced by
  an import-boundary ESLint rule (`eslint.config.mjs`), not by convention — the first draft
  of the plan claimed this boundary with no mechanism, and an empty directory enforces
  nothing.
- **No IO.** No database, no filesystem, no network, no clock. A rule that reads the wall
  clock cannot be tested at a boundary; pass time in.
- **`tenantId` is always an explicit argument.** Never inferred, never ambient. The rules do
  not know what a request is.

## Why the rules live outside the CMS

Two reasons, both learned the hard way elsewhere:

1. **They are the part that must be provably correct.** XP that double-grants or a level
   curve that jumps are the bugs a volunteer cannot diagnose from an admin panel. Pure
   functions with no IO are the only part of this system that can be exhaustively tested.
2. **The economy is retuned by non-programmers.** Tunable values (`xpRules`) live as
   per-organization *data*, seeded on organization creation. This package holds the
   *mechanics*; the numbers are not its business.

## Status in feature 000

**Empty by design.** Feature 000 ships the workspace, the tenancy guardrails and the import
boundary that protects this package. The rules themselves arrive with the gamification
feature (005), and they will land here with tests rather than inside a Payload hook.
