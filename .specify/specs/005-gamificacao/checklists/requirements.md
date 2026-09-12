# Requirements Checklist: 005-gamificacao
<!-- Auto-generated from spec.md by /speckit.specify -->
<!-- Date: 2026-09-12 -->

Generated with the spec. The **substantive** pass — the one 004 learned to run *before*
implementing, where it found nine gaps that would otherwise have arrived as workflow
rejections — is `/speckit.checklist`, after the plan.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: the ledger is append-only by access control | [testability] | [ ] |
| CHK002 | FR-002: an entry records org, profile, action, ref, skill, amount, time | [completeness] | [ ] |
| CHK003 | FR-003: `(tenant, user, action, ref)` unique index, not application-only | [testability] | [ ] |
| CHK004 | FR-004: same transaction as the causing action | [testability] | [ ] |
| CHK005 | FR-005: `packages/game` stays pure — no Payload, no IO | [feasibility] | [ ] |
| CHK006 | FR-006: the five scoring actions, and nothing else | [completeness] | [ ] |
| CHK007 | FR-007: one curve for maker, skill and lab — 5 XP, cap 10 | [consistency] | [ ] |
| CHK008 | FR-008: likes and attendance score nothing | [clarity] | [ ] |
| CHK009 | FR-009: `regrasXp` per organization, seeded on creation | [feasibility] | [ ] |
| CHK010 | FR-010: projections maintained inside the writing transaction | [consistency] | [ ] |
| CHK011 | FR-011: a reconciliation gate that fails on drift | [testability] | [ ] |
| CHK012 | FR-012: lab level on the same curve | [consistency] | [ ] |
| CHK013 | FR-013: the ranking's tie-break is declared, not incidental | [clarity] | [ ] |
| CHK014 | FR-014: admin adds and deactivates; five skills seeded | [completeness] | [ ] |
| CHK015 | FR-015: deactivation moves no XP | [testability] | [ ] |
| CHK016 | FR-016: reactivation restores every level exactly | [testability] | [ ] |
| CHK017 | FR-017: a new skill reaches makers who already existed | [completeness] | [ ] |
| CHK018 | FR-018: hard delete refused, with the entry count named | [clarity] | [ ] |
| CHK019 | FR-019: hidden ≠ erased | [consistency] | [ ] |
| CHK020 | FR-020: `missao` carries the skill it credits | [completeness] | [ ] |
| CHK021 | FR-021: submission and team validation reuse 002's review queue | [feasibility] | [ ] |
| CHK022 | FR-022: credit on approval, once, through the same key | [consistency] | [ ] |
| CHK023 | FR-023: one open submission per mission per maker | [testability] | [ ] |
| CHK024 | FR-024: personal progress signed in; invitation signed out | [completeness] | [ ] |
| CHK025 | FR-025: "per content" survives rewatch and republish | [clarity] | [ ] |
| CHK026 | FR-026: no daily cap, recorded as deliberate | [clarity] | [ ] |
| CHK027 | FR-027: a claim with no progress row is refused | [testability] | [ ] |
| CHK028 | FR-028: every new collection declared, in a walkable order | [completeness] | [ ] |
| CHK029 | FR-029: XP never sums between organizations | [testability] | [ ] |
| CHK030 | FR-030: `sameTenant` on every scoped→scoped relationship | [completeness] | [ ] |
| CHK031 | FR-031: no fourth door, and a refusal is a finding | [consistency] | [ ] |
| CHK032 | FR-032: ten pips, empty at level 0 | [clarity] | [ ] |
| CHK033 | FR-033: the level-1 stand-in is gone from all four pages | [completeness] | [ ] |
| CHK034 | FR-034: `projeto.autor` nullable from the start | [feasibility] | [ ] |
| CHK035 | FR-035: an isolation layer for the ledger, watched red | [testability] | [ ] |
