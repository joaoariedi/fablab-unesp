# Requirements Checklist: 001-design-system-shell
<!-- Auto-generated from spec.md by /speckit.specify -->

Requirement **quality** checks — is the requirement well-formed? — not implementation tests.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: palette as CSS custom properties | [completeness] All seven colours are named with exact hexes, and the decision that render drift is ignored is stated | [ ] |
| CHK002 | FR-002: zero hex literals | [testability] SC-001's probe commit has a defined pass/fail — CI must fail naming both file and value | [ ] |
| CHK003 | FR-003: per-organization tokens | [clarity] Exactly one colour token varies per organization (`--color-primary`); the rest are named as platform-fixed. Resolved by CLR-001 | [ ] |
| CHK004 | FR-004: theme fallback | [completeness] Absent, empty and malformed are three distinct cases and all three are specified | [ ] |
| CHK005 | FR-005: typography | [feasibility] Licence status is stated per face, and the requirement says explicitly which binaries do NOT ship. Resolved by CLR-002 | [ ] |
| CHK006 | FR-006: base components | [completeness] Each component's canonical variant is pinned, including the superseded ones it replaces | [ ] |
| CHK007 | FR-007: logo chip | [consistency] The canonical orange chip and the still-valid other colours do not contradict — header vs poster use is distinguished | [ ] |
| CHK008 | FR-008: responsive shell | [testability] The tab set at each target is enumerable, so SC-004 can assert it rather than eyeball it | [ ] |
| CHK009 | FR-009: logo and PERFIL targets | [completeness] Both signed-in and signed-out destinations are stated | [ ] |
| CHK010 | FR-010: footer | [completeness] All three pillars are named, so "the footer is done" is checkable | [ ] |
| CHK011 | FR-011: background rules | [consistency] The white-background pages are enumerated and do not conflict with the navy base rule | [ ] |
| CHK012 | FR-012: three breakpoints | [testability] 390/834/1440 are named as design targets and required to be tokens, not magic numbers | [ ] |
| CHK013 | FR-013: pixel art | [clarity] "No canvas engine" is stated as a prohibition with a named alternative, not a preference | [ ] |
| CHK014 | FR-014: islands discipline | [testability] SC-007 makes `'use client'` auditable by requiring a stated reason | [ ] |
| CHK015 | FR-015: shape vocabulary | [completeness] The isometric shapes are enumerated rather than gestured at | [ ] |
| CHK016 | FR-016: workbench | [consistency] Excluded from the production bundle **and** from the roadmap's page list — it is a tool, not a page | [ ] |
| CHK017 | FR-017: WCAG AA | [testability] SC-006 computes contrast over documented pairs; "validate contrast" alone would not be checkable | [ ] |
| CHK018 | FR-018: import boundary preserved | [consistency] The feature-000 boundary still holds — packages/ui receives values, it does not fetch them | [ ] |
| CHK019 | SC-002: co-branding with zero source diffs | [testability] Two organizations in one test run, with a source fingerprint compared — the same method that validated SC-008 in feature 000 | [ ] |
| CHK020 | Scope boundary vs feature 003 | [clarity] This feature ships vocabulary, not pages; the LCP budget stays 003's to measure | [ ] |
| CHK021 | Scope boundary vs feature 007 | [consistency] Theme *editing* is 007; this feature only consumes `organizations.theme` | [ ] |
| CHK022 | Decision 2: 10 skill pips | [consistency] The superseded 6-segment mockup is recorded as superseded, not deleted | [ ] |
| CHK023 | Decision 3: pink primary button | [consistency] Both superseded variants (v1 navy, step-2 navy form button) are named | [ ] |
| CHK024 | FR-020: test strategy | [feasibility] Decided before implementation and adds no tool to the locked stack. Resolved by CLR-003 | [ ] |
| CHK025 | FR-019: theme value validated twice | [completeness] Both validation points are named (collection field, and again before CSS), and the fallback behaviour is stated | [ ] |
| CHK026 | SC-011: hostile primaryColor | [testability] The probe is a concrete payload written through the REST API, not "validate input" — pass/fail is unambiguous | [ ] |
| CHK027 | SC-012: renders without the deferred fonts | [testability] Building with no Aldo/Square binaries present is a runnable check, so the fallback path cannot rot unnoticed | [ ] |
| CHK028 | CLR-002 consequence | [consistency] ISS-001 now gates the *visual* completion of this feature, not only public launch — the backlog entry should say so | [ ] |
