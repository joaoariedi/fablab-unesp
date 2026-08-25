# Contributing

Thanks for helping build the Fab Lab CITe Bauru platform! 🛠️ This project is
**documentation-first**: the docs under `docs/` are the contract, and implementation
follows a spec-driven pipeline. Read the [README](README.md) first, then
[`docs/sdd-strategy.md`](docs/sdd-strategy.md) for how features become code.

## Branch model

| Branch | Role |
|---|---|
| `main` | **Production tracking only** — protected (PR required, no force-pushes); moves only via release branches; every merge is tagged |
| `dev` | Default branch — integration; all day-to-day work lands here via PR |
| `feature/<slug>` | One per roadmap feature or task, branched from `dev`, merged back via PR |
| `release/X.Y.Z` | Branched from `dev` to finalize a version: changelog entry moved from `[Unreleased]`, last fixes only; merged into `main` via PR, tagged `vX.Y.Z`, then merged back into `dev` |
| `hotfix/<slug>` | Only for production emergencies: branched from `main`, merged to both `main` (tag `vX.Y.Z+1`) and `dev` |

Flow: `feature/* → dev → release/X.Y.Z → main (tag) → back-merge to dev`.

## Versioning (SemVer)

We follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html):

- **`0.y.z` (current, pre-launch):** the public API is not stable. **MINOR** marks
  project milestones (specification complete, each roadmap feature 000–007 landing,
  release candidates); **PATCH** marks fixes and documentation corrections. Breaking
  changes may occur in MINOR bumps, always called out in the changelog.
- **`1.0.0`:** the first production launch of the Fab Lab CITe Bauru site.
- **After `1.0.0`:** **MAJOR** = breaking changes to public contracts (URLs, REST/CMS
  schema, tenant model, shipped migrations); **MINOR** = backwards-compatible features;
  **PATCH** = backwards-compatible fixes.

Versions exist as git tags (`vX.Y.Z`) on `main` plus a [CHANGELOG.md](CHANGELOG.md)
entry — there is no version file until the app workspace lands.

## Changelog

[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/): every PR that changes
behavior, decisions or structure adds a line under `[Unreleased]` (grouped as
Added/Changed/Deprecated/Removed/Fixed/Security). Release branches move those lines
under the new version with the date.

## Commits and language

- Commit messages in **English**, `<type>: <description>` — types: `feat`, `fix`,
  `docs`, `refactor`, `test`, `style`, `perf`.
- **Site content and product docs are PT-BR; code, commits and code comments are
  English.**

## Documentation conventions (load-bearing — please keep them)

- Every decision is dated: `**Decidido (<quem>, YYYY-MM-DD):** …`.
- Anything not backed by a mockup or a decision is marked `(proposta)`.
- Superseded content is ~~struck through~~, **never deleted** — mockups remain the
  historical record even when decisions override them. This provenance is how the
  project survives contributor rotation.
- Open items live in [`docs/backlog.md`](docs/backlog.md) (sequential `ISS-nnn` ids) and
  in each page spec's *Questões em aberto* section.

## Quality gates (once implementation starts)

Defined in [`docs/sdd-strategy.md`](docs/sdd-strategy.md) and the project constitution
(`.specify/`, created at Passo 0): tests with every feature and regression tests with
every bug fix; lint/format/typecheck clean; security review on upload/auth surfaces;
functions < 50 lines, files < 500 lines of code; the multi-tenant isolation harness is a
merge-blocking CI gate.

## Where to start

- The 🗺️ roadmap in the README (features 000–007) — 000/001 are ready to begin.
- [`docs/backlog.md`](docs/backlog.md) for out-of-band items (e.g., ISS-002: drafting
  the terms of use).
- Design/art tasks: `docs/product/exports/ajustes-arte-designer.txt`.
