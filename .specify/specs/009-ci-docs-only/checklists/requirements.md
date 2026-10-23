# Requirements Checklist: 009-ci-docs-only
<!-- Auto-generated from spec.md by /hef.spec -->

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: classify from base→head changed files | [completeness] | [ ] |
| CHK002 | FR-002: docs-only = all `*.md`, none read by tests | [testability] | [ ] |
| CHK003 | FR-002: "read by tests" rule errs toward code | [edge-case] | [ ] |
| CHK004 | FR-003: code-stage jobs report success without work | [testability] | [ ] |
| CHK005 | FR-004: matrix legs each report their own context | [completeness] | [ ] |
| CHK006 | FR-005: docs-stage jobs always run | [testability] | [ ] |
| CHK007 | FR-006: code runs unchanged | [testability] | [ ] |
| CHK008 | FR-007: classifier failure → full run | [negative-case] | [ ] |
| CHK009 | FR-008: push events always full | [testability] | [ ] |
| CHK010 | FR-009: no rename, no context change | [consistency] | [ ] |
| CHK011 | FR-010: no third-party action | [security] | [ ] |
| CHK012 | FR-011: pin tests green, unweakened | [consistency] | [ ] |
| CHK013 | FR-012: classifier script contract + tests | [testability] | [ ] |
| CHK014 | FR-013: wiring test | [testability] | [ ] |
| CHK015 | FR-014: whole-tree tests still run on docs-only, set pinned | [completeness] | [ ] |
