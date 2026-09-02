# Requirements Checklist: 001-design-system-shell
<!-- Auto-generated from spec.md by /speckit.specify -->

Requirement **quality** checks — is the requirement well-formed? — not implementation tests.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: palette as CSS custom properties | [completeness] All seven colours are named with exact hexes, and the decision that render drift is ignored is stated | [x] |
| CHK002 | FR-002: zero hex literals | [testability] SC-001's probe commit has a defined pass/fail — CI must fail naming both file and value | [x] |
| CHK003 | FR-003: per-organization tokens | [clarity] Exactly one colour token varies per organization (`--color-primary`); the rest are named as platform-fixed. Resolved by CLR-001 | [x] |
| CHK004 | FR-004: theme fallback | [completeness] Absent, empty and malformed are three distinct cases and all three are specified | [x] |
| CHK005 | FR-005: typography | [feasibility] Licence status is stated per face, and the requirement distinguishes the right to **use** from the right to **redistribute** — the two come apart here. Resolved by CLR-002 | [x] |
| CHK006 | FR-006: base components | [completeness] Each component's canonical variant is pinned, including the superseded ones it replaces | [x] |
| CHK007 | FR-007: logo chip | [consistency] The canonical orange chip and the still-valid other colours do not contradict — header vs poster use is distinguished | [x] |
| CHK008 | FR-008: responsive shell | [testability] The tab set at each target is enumerable, so SC-004 can assert it rather than eyeball it | [x] |
| CHK009 | FR-009: logo and PERFIL targets | [completeness] Both signed-in and signed-out destinations are stated | [x] |
| CHK010 | FR-010: footer | [completeness] All three pillars are named, so "the footer is done" is checkable | [x] |
| CHK011 | FR-011: background rules | [consistency] **OPEN — the requirements genuinely conflict.** FR-011 enumerates the white content areas (Biblioteca 3D, Aulas) and `visual-identity.md`'s round-2 decision requires cards there to be white with a navy outline and shadow. FR-006 specifies `Card` with an outline union of `claro \| primary` and no navy variant, so a card dropped on those pages renders light-on-white. FR-011 is mapped to T036, whose file is `palette.css`, so the component-side variant is owned by no task. A PO decision, not an oversight to tick away | [ ] |
| CHK012 | FR-012: three breakpoints | [testability] 390/834/1440 are named as design targets and required to be tokens, not magic numbers | [x] |
| CHK013 | FR-013: pixel art | [clarity] "No canvas engine" is stated as a prohibition with a named alternative, not a preference | [x] |
| CHK014 | FR-014: islands discipline | [testability] SC-007 makes `'use client'` auditable by requiring a stated reason | [x] |
| CHK015 | FR-015: shape vocabulary | [completeness] The isometric shapes are enumerated rather than gestured at | [x] |
| CHK016 | FR-016: workbench | [consistency] It is a tool, not a page: absent from the roadmap's page list, and **unreachable in production** — reworded in review round 2, because App Router has no build-time page exclusion, so a guarded route still ships its module and "excluded from the production bundle" was not achievable | [x] |
| CHK017 | FR-017: WCAG AA | [testability] SC-006 computes contrast over documented pairs; "validate contrast" alone would not be checkable | [x] |
| CHK018 | FR-018: import boundary preserved | [consistency] The feature-000 boundary still holds — packages/ui receives values, it does not fetch them | [x] |
| CHK019 | SC-002: co-branding with zero source diffs | [testability] Two organizations in one test run, with a source fingerprint compared — the same method that validated SC-008 in feature 000 | [x] |
| CHK020 | Scope boundary vs feature 003 | [clarity] This feature ships vocabulary, not pages; the LCP budget stays 003's to measure | [x] |
| CHK021 | Scope boundary vs feature 007 | [consistency] Theme *editing* is 007; this feature only consumes `organizations.theme` | [x] |
| CHK022 | Decision 2: 10 skill pips | [consistency] The superseded 6-segment mockup is recorded as superseded, not deleted | [x] |
| CHK023 | Decision 3: pink primary button | [consistency] Both superseded variants (v1 navy, step-2 navy form button) are named | [x] |
| CHK024 | FR-020: test strategy | [feasibility] Decided before implementation and adds no tool to the locked stack. Resolved by CLR-003 | [x] |
| CHK025 | FR-019: theme value validated twice | [completeness] Both validation points are named (collection field, and again before CSS), and the fallback behaviour is stated | [x] |
| CHK026 | SC-011: hostile primaryColor | [testability] The probe is a concrete payload written through the REST API, not "validate input" — pass/fail is unambiguous | [x] |
| CHK027 | SC-012: no SquareFont artefact enters the repository | [testability] Pass/fail is unambiguous — no tracked file matches the glob and no shippable source names the face. **Rewritten twice in review, then again when the designer removed SquareFont**: the original "builds with the fonts absent" was tautological, its replacement went vacuous over an empty set, and T011b planted a probe to prove the surviving form goes red | [x] |
| CHK028 | CLR-002 consequence | [clarity] Both faces ship in-repo, so CI renders what production renders and **feature 007 loses the font-delivery concern entirely** — the earlier version of this check named that concern as deferred, which stopped being true when SquareFont left the project on 2026-08-27 | [x] |

## Result

**27 of 28 satisfied; CHK011 left open**, because the requirements it checks for consistency
are genuinely inconsistent with each other — see the row. Ticking it would have asserted a
coherence the spec does not have.

Three checks were **rewritten rather than ticked as written** (CHK016, CHK027, CHK028): each
described a requirement that review revised afterwards — the workbench's bundle exclusion,
SC-012's subject, and a feature-007 concern that stopped existing when SquareFont left the
project. Ticking stale text asserts nothing; leaving it open would have hidden that the
requirement moved rather than failed.

CHK002 is the only one with CI evidence behind it rather than a reading of the spec: PR #8
planted four violation shapes and each was rejected by name, file, line and value.
