# Requirements Checklist: 003-paginas-publicas
<!-- Auto-generated from spec.md by /speckit.specify -->
<!-- Date: 2026-09-06 -->

Requirement *quality* checks — whether each requirement is well-formed enough to build and to
test. Not implementation tests. Tick a row only when the answer is evidenced, not assumed.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: placeholders replaced | Is "no remaining importer of `PageStub`" checkable by a command rather than by reading? | [ ] |
| CHK002 | FR-002: public reads via the choke point | Does the requirement name the exact function, so a reviewer cannot satisfy it with a different one? [clarity] | [ ] |
| CHK003 | FR-003: published-only | Is "including by direct slug" stated, so the obvious listing-only reading is closed? [completeness] | [ ] |
| CHK004 | FR-003 | Does a negative case exist — content that must NOT appear — rather than only a positive one? [testability] | [ ] |
| CHK005 | FR-004..FR-009: the six pages | Does each page requirement trace to a section of its own page spec in `docs/product/pages/`? [completeness] | [ ] |
| CHK006 | FR-006, FR-007 | Are the two light-background pages distinguished from the four navy ones wherever it changes the requirement? [consistency] | [ ] |
| CHK007 | FR-008: calendar | Is `evento`'s different status set accounted for, rather than assuming the three-state queue? [consistency] | [ ] |
| CHK008 | FR-009: Home v1 | Is the boundary against feature 006 stated in terms of data that does not exist yet, not taste? [clarity] | [ ] |
| CHK009 | FR-010: URL state | Is the set of parameters enumerated somewhere, or only implied by "filter, search, sort and page"? [completeness] | [ ] |
| CHK010 | FR-011: default order | Is the ordering field named, and does it exist on every listed collection? [feasibility] | [ ] |
| CHK011 | FR-012: anonymous downloads | Is the counter's semantics fixed — act, not unique visitor — so the test cannot be written both ways? [clarity] | [ ] |
| CHK012 | FR-012 | Does it say downloads pass through the tenancy choke point, given this is an anonymous *write*? [completeness] | [ ] |
| CHK013 | FR-013: classes play publicly | Is the absence of progress/badge/resume stated as correct behaviour rather than left as a gap? [clarity] | [ ] |
| CHK014 | FR-014: 3D preview | Is the fallback defined for every format the data model allows, not just the happy one? [completeness] | [ ] |
| CHK015 | FR-014 | Is the requirement independent of CLR-002's answer, or does it silently assume a placement? [consistency] | [ ] |
| CHK016 | FR-015: the heart | Is "the count does not change" stated, so an optimistic update cannot pass? [testability] | [ ] |
| CHK017 | FR-016: publish CTAs | Is "does not render" distinguished from "renders disabled"? [clarity] | [ ] |
| CHK018 | FR-017, FR-018: empty and error | Does each listing have both, or do some pages inherit them by assumption? [completeness] | [ ] |
| CHK019 | FR-019: skeletons | Is "preserves the grid" specific enough to fail a spinner? [testability] | [ ] |
| CHK020 | FR-020: search | Are the searched fields enumerated, and is 300ms a requirement or an example? [clarity] | [ ] |
| CHK021 | FR-021: breakpoints | Are the three targets the same ones feature 001 used, so the shell and pages cannot disagree? [consistency] | [ ] |
| CHK022 | FR-022: touch targets | Does it name which elements, or only a size? [completeness] | [ ] |
| CHK023 | FR-023: keyboard | Is card activation by Enter stated separately from focus visibility? [completeness] | [ ] |
| CHK024 | FR-024: islands | Is "interactivity is real" operationalised into a list a test can check? [testability] | [ ] |
| CHK025 | FR-025: LCP | Is the device profile named precisely enough to reproduce the measurement? [testability] | [ ] |
| CHK026 | FR-025 | Is per-page stated, closing the average-across-pages loophole? [clarity] | [ ] |
| CHK027 | FR-025 | Is there a stated consequence of missing it, rather than leaving a waiver implicit? [completeness] | [ ] |
| CHK028 | FR-026: isolation harness | Is the new vantage point — anonymous public — named as distinct from the ones 002 added? [completeness] | [ ] |
| CHK029 | FR-026 | Is the signed-in-visitor-from-another-org case covered, given the plugin treats it differently? [consistency] | [ ] |
| CHK030 | FR-027: no hex literals | Is the rule stated generally, rather than as the list of files its gate happens to scan? [clarity] | [ ] |
| CHK031 | FR-028: light pages | Is "never pink for small text on white" testable, or does it need a size threshold? [testability] | [ ] |
| CHK032 | SC-006 | Is the LCP gate required to have been watched failing before it counts? [testability] | [ ] |
| CHK033 | SC-003, SC-007, SC-008 | Does every gate inherited from 000/001/002 say what *extends* it here, rather than restating it? [consistency] | [ ] |
| CHK034 | US7 vs 004 | Does the invitation point at a route that exists today (`/login`, stubbed in 001)? [feasibility] | [ ] |
| CHK035 | CLR-001..003 | Would any of the three unresolved questions change work already specified as decided? [consistency] | [ ] |
| CHK036 | CLR-002 vs FR-025 | Is the tension between the 3D viewer and the LCP budget stated where a planner will see it? [feasibility] | [ ] |
| CHK037 | Scope: Home panels | Is the 003/006 split justified by data dependency, and does 006's row in the roadmap agree? [consistency] | [ ] |
| CHK038 | Scope: no signed-in state | Does any FR accidentally require signed-in behaviour despite CLR-005? [consistency] | [ ] |
| CHK039 | Whole spec | Does every FR trace to at least one US, and every US to at least one FR? [completeness] | [ ] |
| CHK040 | Whole spec | Does every SC name a command or artefact that produces the evidence? [testability] | [ ] |
