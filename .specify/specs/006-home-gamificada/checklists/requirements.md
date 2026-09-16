# Requirements Checklist: 006-home-gamificada
<!-- Auto-generated from spec.md by /speckit.specify -->
<!-- Superseded by a substantive pass from /speckit.checklist before implementation -->

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: `destaqueHome` + `ordemDestaque` on `missao` | [completeness] | [ ] |
| CHK002 | FR-001: the band reads exactly the ticked missions | [testability] | [ ] |
| CHK003 | FR-002: migration with its `.json` snapshot, drift gate clean | [testability] | [ ] |
| CHK004 | FR-003: the tie-break is declared, not the database's default | [clarity] | [ ] |
| CHK005 | FR-004: at most three cards | [testability] | [ ] |
| CHK006 | FR-005: curation does not publish | [consistency] | [ ] |
| CHK007 | FR-006: icon, title, description, bar | [completeness] | [ ] |
| CHK008 | FR-007: the two-step model is shared with `/missoes`, not restated | [consistency] | [ ] |
| CHK009 | FR-008: the percentage is personal and no other maker's is readable | [testability] | [ ] |
| CHK010 | FR-009: signed out shows no percentage (CLR-002) | [clarity] | [ ] |
| CHK011 | FR-010: the personal read fails separably | [testability] | [ ] |
| CHK012 | FR-011: `VER TODAS ›` reaches `/missoes` | [testability] | [ ] |
| CHK013 | FR-012: `nivelDoLab` gains its first caller | [completeness] | [ ] |
| CHK014 | FR-013: the bar is XP-within-level, never a running total | [clarity] | [ ] |
| CHK015 | FR-014: no `Próxima recompensa` block in v1 | [consistency] | [ ] |
| CHK016 | FR-015: an empty lab reads 0 with an empty bar | [testability] | [ ] |
| CHK017 | FR-016: the lab card is public | [consistency] | [ ] |
| CHK018 | FR-017: top five, in `/ranking`'s order | [testability] | [ ] |
| CHK019 | FR-018: position, avatar, name, handle, XP | [completeness] | [ ] |
| CHK020 | FR-019: a null avatar renders the placeholder | [testability] | [ ] |
| CHK021 | FR-020: `VER RANKING COMPLETO` reaches `/ranking` | [testability] | [ ] |
| CHK022 | FR-021: the ordering is expressed once | [consistency] | [ ] |
| CHK023 | FR-022: data, empty and failed are three outcomes | [clarity] | [ ] |
| CHK024 | FR-023: a failed block is contained | [testability] | [ ] |
| CHK025 | FR-024: each empty block names its own emptiness | [completeness] | [ ] |
| CHK026 | FR-025: `TenantUnresolvedError` stays a 404 | [consistency] | [ ] |
| CHK027 | FR-026: the reads are concurrent | [testability] | [ ] |
| CHK028 | FR-027: `home.test.ts` § 3 is inverted | [completeness] | [ ] |
| CHK029 | FR-028: the Home's docblock is rewritten | [completeness] | [ ] |
| CHK030 | FR-029: no new island | [testability] | [ ] |
| CHK031 | FR-030: every read confined by the choke point | [consistency] | [ ] |
| CHK032 | FR-031: no new tenancy door | [feasibility] | [ ] |
| CHK033 | FR-032: the signed-out path reads only what it may | [testability] | [ ] |
| CHK034 | FR-033: the LCP budget passes for `/` | [testability] | [ ] |
| CHK035 | FR-034: the budget's own proof still fails on command | [testability] | [ ] |
