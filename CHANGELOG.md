# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — see
[CONTRIBUTING.md](CONTRIBUTING.md) for the versioning and branching strategy.

## [Unreleased]

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
