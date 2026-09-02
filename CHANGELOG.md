# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the versioning and branching strategy.

## [Unreleased]

### Added

- **Design system** (`@fablab/ui`, feature 001) — the identity layer the product renders
  from. Tokens (palette, two font faces with a whole-pixel type scale, breakpoints/spacing/
  radii/hard shadow), nine components, the isometric shape vocabulary, and the responsive
  shell: `HeaderNav`, `MobileTabBar`, `MenuSheet`, `Footer`, with the tab sets held as data.
  Exactly one token varies per organization — `--color-primary`, resolved from
  `organizations.theme` and validated twice (collection field, then again before it reaches
  CSS).
- **The site serves.** The frontend layout mounts the shell, injects the validated accent,
  preloads the display face, and turns an unresolved host into a 404 rather than falling
  back to another organization's identity. Placeholder routes stand behind every navigation
  destination so the shell can be walked; the real pages are feature 003's.
- **A component workbench** at `/workbench`, built from the public surface only and 404ing
  in production, rendering every component and state at 390 / 834 / 1440.
- **Two colour fences.** ESLint rejects hex literals and the private `--color-rosa-raw` in
  TypeScript — including inside template literals, which styled-jsx makes reachable — and
  `scripts/check-colour-tokens.sh` covers `.css`, where component colour is actually
  written. The script now has its own merge-blocking CI job (`Colour tokens`); it previously
  ran nowhere, because `pnpm lint` is `eslint .` and executes no shell scripts.
- **A contrast gate.** `DOCUMENTED_PAIRS` is iterated against WCAG AA thresholds, so a pair
  that fails cannot be documented — which answers `visual-identity.md`'s open question about
  pink on navy (8.12:1, clears AA at body size; on white it is 2.05:1 and forbidden).


### Added — feature 000

- **Spec-kit scaffolding** (`.specify/`): templates for spec, plan, tasks and checklist.
- **Project constitution** v1.0.0 (`.specify/memory/constitution.md`) — five principles
  (locked stack with swappable services; tenancy as a property of the data; pure game
  rules over an immutable ledger; design and content fidelity; enumerated CI
  verification gates), plus tech stack and architecture constraints.
- **CI** (`.github/workflows/ci.yml`): eleven merge-blocking gates on `dev` and `main` —
  secret scan (gitleaks), markdown lint, relative-link integrity, lint, type check, tests,
  build, the cross-tenant isolation harness, two per-layer proofs that the harness can
  fail, and the migration drift gate. The set grows with each feature and never shrinks.
- **Feature 000 — multi-tenant foundation.** The workspace (pnpm workspaces, `apps/web`
  with Next 16 + Payload CMS 3 embedded, `packages/game`, `packages/ui`, `infra/`) and the
  tenancy guardrails every later feature inherits:
  - **One choke point.** `lib/tenancy` is the only module allowed to reach Payload data,
    enforced by an ESLint **import boundary** plus syntax rules for `req.payload` — because
    Payload's Local API skips access control by default, so the dangerous call is a clean
    `payload.find()` with no suspicious token. Reproduced live during the spike: a bare
    find returned two organizations' rows.
  - **Versioned scope registry** — every collection declared `scoped` or `global`, with CI
    failing in both directions if the registry and the config disagree.
  - **Same-tenant relationship validator** — project code, because the plugin does not do
    it: a row in org A was updated to point at a row in org B and the write succeeded.
  - **Isolation harness** over four surfaces (choke point, Local API as an RSC calls it,
    the collection's own endpoint, and REST under both bearer and cookie auth),
    demonstrated **failing before passing** and re-proved on every CI run by a mutation
    job that breaks one layer at a time.
  - **Invite flow** that adds a membership for an existing address and records a pending
    invite for an unknown one — never creating an account before terms acceptance, and
    never disclosing which branch it took.
  - Host→organization resolution with a sovereign fallback, an idempotent seed, and
    committed migrations with a drift gate.

### Changed

- **Fonts: two, not three.** The designer replaced SquareFont with Aldo the Apache for the
  "CITE BAURU" logotype (2026-08-27), which closed the licensing question at its source —
  SquareFont was the only face whose metadata asserted `All Rights Reserved`. Both remaining
  faces ship in the repository, so CI renders what production renders, and `--font-logotype`
  was deleted rather than aliased to `--font-display`.
- **Seed**: the CITe organization carries `localhost` and `127.0.0.1` as domains, so a dev
  machine serves the site even once fixture organizations have switched off the
  single-organization host fallback.
- **Next is pinned to `>=16.2.6 <17`,** not the `>=15.5` the plan chose. Payload 3.88's
  peer range excludes the whole 15.5.x line, so the original pin was unsatisfiable. Next 16
  also renames `middleware` to `proxy` (and moves it from the `edge` runtime to `nodejs`),
  and `revalidateTag` now requires a cache-life profile.
- **Constitution v1.2.0** — two amendments, each because a claim was measured and found
  wrong: linting by method name replaced by an import boundary, and host resolution moved
  out of the proxy layer to a cached server-side lookup.

### Fixed

- Four documentation lines where a wrapped prose `+` had been auto-rewritten as a list
  marker, inverting the meaning (e.g. "nome + `@nomesobrenome`").
- **Home hero art now carries the canonical logo-chip.** The designer redelivered
  `docs/product/design/home-desktop.png` with the orange extruded `FAB ● LAB` chip (cube
  *between* the words) in place of the pink one with the cube at the left. This closes the
  round-2 discrepancy that `pages/home.md` and `pages/calendario.md` had been carrying as
  an explicit caveat — the mockup and the decision now agree, so the caveats are struck
  through and dated rather than left to mislead.

## [0.1.0] — 2026-08-25

The **specification milestone**: the product is fully specified and the architecture is
ratified; implementation has not started.

### Added

- **Product documentation** (`docs/product/`): concept, information architecture,
  audiences and platform requirements; gamification system with a decided XP economy
  (1 XP per action, 5 XP per level, cap 10, likes grant nothing, review-queue moderation
  with XP on approval); visual identity (palette incl. `light` token, typography, art
  direction, UI patterns).
- **Ten page specifications** (`docs/product/pages/`) — home, biblioteca-3d, projetos,
  artigos, aulas, calendário, criar conta (2 steps), login (by reuse of step 2),
  minha conta and the public maker profile decision — each with desktop structure
  faithful to mockups, tablet/mobile adaptations, CMS content models, gamification
  hooks, states and dated decisions. Built through **six designer decision rounds** and
  a product-owner decision log, with every mockup adversarially verified against its
  transposition.
- **Designer mockups** (`docs/product/design/`), named by page: desktop pages, the
  pixel-art home hero (desktop + dedicated mobile art), avatar builder, signup step 2
  and Minha Conta; identity boards.
- **Architecture decision record** (`docs/tech-stack.md`): Next.js (App Router/RSC) +
  Payload CMS 3 embedded, PostgreSQL, MinIO↔S3/R2 swappable by env, Docker Compose on a
  campus VM — decided by adversarial panel (A 23 · B 20 · C 15), re-validated in a
  verified benchmark against an Astro/Supabase proposal (A 51 · C 42 · B 27,
  `docs/tech-stack-benchmark.md`) and **ratified on 2026-08-25** after external senior
  game-developer review. Colyseus.js and Phaser.js recorded as sanctioned tools for
  future realtime/game-specific needs only.
- **Multi-tenancy design**: row-level tenancy via `@payloadcms/plugin-multi-tenant`,
  "tenancy is a property of the data" principle, per-organization gamification and
  admin-manageable skills catalog, governance gates for external labs.
- **Implementation roadmap** (`docs/sdd-strategy.md`): features 000–007 with a
  spec-driven pipeline and binding performance/quality absorptions.
- **Brand assets** (`docs/product/brand/`): GitHub banner and social preview, brand
  tokens documentation.
- **Open source**: MIT license with brand/art carve-outs; unlicensed display-font
  binaries purged from history (use allowed, redistribution avoided — ISS-001);
  Comfortaa bundled under OFL 1.1; repository made public with `dev` as default branch
  and protected `main`.

[Unreleased]: https://github.com/joaoariedi/fablab-unesp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/joaoariedi/fablab-unesp/releases/tag/v0.1.0
