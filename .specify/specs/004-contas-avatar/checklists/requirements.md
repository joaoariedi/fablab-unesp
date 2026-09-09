# Requirements Checklist: 004-contas-avatar
<!-- Auto-generated from spec.md by /speckit.specify -->
<!-- Date: 2026-09-09 -->

Requirement *quality* checks — whether each requirement is well-formed enough to build and to
test. Not implementation tests. Tick a row only when the answer is evidenced, not assumed.

**Run this before `/speckit.implement`, not after.** Feature 003 skipped it and found, once the
feature had merged, that a P1 scenario (its US7) had never been turned into a task — invisible to
eight adversarial workflow runs, because each checked a task against its own description and
nothing checked the spec against the task list. That gap is now this feature's FR-025.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001, FR-002: two steps | Is "the avatar is intact on `VOLTAR`" stated as a requirement rather than assumed of the implementation? [completeness] | [ ] |
| CHK002 | FR-003: catalogue sizes | Are the nine slots and their counts traceable to `onboarding.md`, so the spec cannot drift from the art? [consistency] | [ ] |
| CHK003 | FR-005: optional slots | Is "complete" defined as a slot set, so a test can decide when step 1 may finish? [testability] | [ ] |
| CHK004 | FR-006: layer order and rotation | Is `camada_z` a requirement or a *(proposta)* inherited from the page spec? [clarity] | [ ] |
| CHK005 | FR-007: sprite failure | Is the degraded state specified per slot, rather than "handle errors"? [testability] | [ ] |
| CHK006 | FR-008: step 2 fields | Does every field name a type and a bound, so validation is buildable from the spec alone? [completeness] | [ ] |
| CHK007 | FR-009: any e-mail | Is the absence of a domain rule stated positively, so nobody adds one back as a "fix"? [clarity] | [ ] |
| CHK008 | FR-010: derived handle | Does the requirement defer to CLR-002 rather than inventing a rule the clarification will contradict? [consistency] | [ ] |
| CHK009 | FR-010, SC-009 | Is handle uniqueness scoped — per organization or global — given one login may hold two profiles? [completeness] | [ ] |
| CHK010 | FR-012: terms | Is the **version** stored as well as the timestamp, so a re-consent can be demanded later? [completeness] | [ ] |
| CHK011 | FR-013: skills at level 0 | Is this stated as a data shape rather than as an XP grant, so it does not collide with feature 005? [consistency] | [ ] |
| CHK012 | FR-014, SC-002: neutral failure | Is "the same message" strengthened to "the same response", so timing and status cannot leak the difference? [testability] | [ ] |
| CHK013 | FR-015: rate limiting | Are the threshold and window named, or left for the implementer to invent? [completeness] | [ ] |
| CHK014 | FR-015 | Is the limit per account *and* per source, so one does not defeat the other? [completeness] | [ ] |
| CHK015 | FR-017: reset tokens | Are single-use, expiry and the identical-answer rule all three stated? [completeness] | [ ] |
| CHK016 | FR-018: sessions | Is the lifetime a number, and is server-side invalidation distinguished from clearing a cookie? [clarity] | [ ] |
| CHK017 | FR-019: unverified accounts | Is the bounded set enforced in **access control**, not only hidden in the UI? [testability] | [ ] |
| CHK018 | FR-020, SC-005 | Is "never logged" checkable by a command over emitted logs rather than by reading code? [testability] | [ ] |
| CHK019 | FR-021, FR-022 | Is the display/award split stated in terms of what this feature must NOT do? [clarity] | [ ] |
| CHK020 | FR-024: `avatar_render` | Is regeneration tied to a trigger, so a stale render cannot survive an edit? [completeness] | [ ] |
| CHK021 | FR-025: the invitation | Is the microcopy quoted, so it cannot be paraphrased into a different promise? [clarity] | [ ] |
| CHK022 | FR-025, FR-026 | Is the visitor path distinguished from the signed-in path, given both start at the same control? [consistency] | [ ] |
| CHK023 | FR-026 | Is "the count returns to what it was" stated, so an optimistic update that sticks cannot pass? [testability] | [ ] |
| CHK024 | FR-027, CLR-001 | Does every new collection have a declared scope **and a reason**, the way 000's registry demands? [completeness] | [ ] |
| CHK025 | FR-028 | Is the signed-in choke point named exactly, and distinguished from the anonymous one? [clarity] | [ ] |
| CHK026 | FR-029, SC-008 | Is the harness required to be **watched failing** on the new vantage point, not merely to exist? [testability] | [ ] |
| CHK027 | FR-030 | Is the legal basis for each field named, or only the field list? [completeness] | [ ] |
| CHK028 | FR-031, CLR-003 | Is deletion's effect on published content deferred to a decision rather than guessed at? [consistency] | [ ] |
| CHK029 | FR-031 | Is export specified as a format and a delivery, not just as a right? [testability] | [ ] |
| CHK030 | FR-032, CLR-004 | Is the island's cost a stated decision with a budget, rather than a discovery at measurement time? [feasibility] | [ ] |
| CHK031 | FR-033 | Does the avatar asset path reuse 002's media collections and limits rather than a new one? [consistency] | [ ] |
| CHK032 | FR-034, CLR-005 | Is the palette-as-data exemption argued against feature 001's fence, rather than asserted? [clarity] | [ ] |
| CHK033 | SC-011 | Can the LCP criterion be measured at all before CLR-004 is answered? [feasibility] | [ ] |
| CHK034 | Whole spec | Does every FR trace to at least one US, and every US to at least one FR? [completeness] | [ ] |
| CHK035 | Whole spec | Does every SC name a command or artefact that produces the evidence? [testability] | [ ] |
| CHK036 | Whole spec | **Does every P1 scenario have a requirement that will become a task?** 003's US7 did not, and nothing noticed until after it shipped [completeness] | [ ] |
| CHK037 | Boundaries | Are the 005 and 006 boundaries stated in terms of data that does not exist yet, the way 003's CLR-004 did? [consistency] | [ ] |
| CHK038 | Inherited | Does any requirement weaken a constraint from 000, 002 or 003 — the choke point, the registry, the media path, the island bound? [consistency] | [ ] |
