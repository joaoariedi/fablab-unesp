# Requirements Checklist: 002-cms-conteudo
<!-- Auto-generated from spec.md by /speckit.specify -->

Requirement **quality** checks — is the requirement well-formed? — not implementation tests.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: five content collections | [completeness] Each collection's fields trace to a page spec's "Modelo de conteúdo", not to invention | [ ] |
| CHK002 | FR-001: PT-BR labels | [clarity] Site content is PT-BR and code is English (constitution Principle 4); the requirement says which side field labels fall on | [ ] |
| CHK003 | FR-002: categories per organization | [consistency] Does not contradict the page specs, which list CITe's categories as examples rather than as a fixed set | [ ] |
| CHK004 | FR-004: scope declaration | [testability] The registry test already fails on an undeclared collection, so pass/fail exists before the code does | [ ] |
| CHK005 | FR-005: usuario stays global | [consistency] Agrees with feature 000's "identity is global, role is per organization" rather than re-deciding it | [ ] |
| CHK006 | FR-006: query constraint, never boolean | [clarity] Stated as feature 000 states it, so the rule is one rule and not two similar ones | [ ] |
| CHK007 | FR-008: review workflow | [completeness] All three states and the transition that is privileged are named | [ ] |
| CHK008 | FR-009: idempotent approval | [testability] SC-004 gives it a concrete sequence — publish, unpublish, republish — rather than "should not double-credit" | [ ] |
| CHK009 | FR-011: format allowlists | [completeness] Every extension is enumerated per field group; no "and similar formats" | [ ] |
| CHK010 | FR-012: size caps | [clarity] A named constant, not a number repeated per field — so the cap can be found and changed in one place | [ ] |
| CHK011 | FR-013: generated object keys | [testability] SC-008 names two concrete hostile filenames rather than "sanitise input" | [ ] |
| CHK012 | FR-014: bytes over extension | [feasibility] Achievable for images; CLR-003 acknowledges it is NOT achievable in the same sense for 3D formats, rather than pretending it is | [ ] |
| CHK013 | FR-015/FR-016: anonymous downloads | [consistency] An anonymous WRITE to a scoped collection does not contradict the tenancy rules — the requirement names how it resolves its organization | [ ] |
| CHK014 | FR-017: no anonymous like | [consistency] Sits beside FR-015's open downloads without conflict; the two differ deliberately and the spec says so | [ ] |
| CHK015 | FR-018: Payload internal collections | [completeness] Names the specific risk (`payload-locked-documents` enumerating document IDs) rather than "audit Payload's tables" | [ ] |
| CHK016 | FR-018: inherited from feature 000 | [consistency] Feature 000 deferred this decision to this feature in writing; the requirement picks it up rather than re-opening it | [ ] |
| CHK017 | FR-019: storage swap | [testability] SC-011 requires a clean `git diff` after the swap, so "config only" is checkable | [ ] |
| CHK018 | FR-020: derived counters | [completeness] A maintenance strategy is required and required to be uniform — the spec does not leave each counter to invent its own | [ ] |
| CHK019 | FR-021: admin shows one organization | [completeness] Relationship pickers are named explicitly, since that is the surface a scoped list view does not cover by itself | [ ] |
| CHK020 | FR-022: relations to feature 005 | [clarity] Declaring the field now and the target later is stated as a deliberate choice with its reason, not left ambiguous | [ ] |
| CHK021 | FR-024: choke point preserved | [consistency] The feature-000 boundary is restated as inherited, not re-derived with different words | [ ] |
| CHK022 | SC-003: locked documents | [testability] Requires being seen FAILING first against today's behaviour — the "gate nobody has watched fail" rule from feature 001 | [ ] |
| CHK023 | Scope boundary vs 003 | [clarity] This feature ships the model, not the pages that render it | [ ] |
| CHK024 | Scope boundary vs 004 | [clarity] Sign-up, login and the avatar builder are excluded. **Resolved by CLR-002**: `perfil_maker` is created here with the two fields content needs; 004 adds the avatar to the same collection rather than reshaping it | [ ] |
| CHK025 | Scope boundary vs 005 | [clarity] XP and skills are excluded. **Resolved by CLR-001**: this feature writes no XP; it records approval idempotently and 005 reads it | [ ] |
| CHK026 | CLR-003: upload depth | [feasibility] Resolved as magic bytes and size with no server-side parse, and the residual risk is NAMED (a `.glb` is verified as a container, never as a model) rather than left implied | [ ] |
| CHK027 | Decisions taken | [consistency] All four are PO decisions already dated in the page specs, quoted rather than re-decided | [ ] |
| CHK028 | SC-012: gates grow | [consistency] Agrees with the constitution's "the gate set grows, never shrinks" and with what features 000 and 001 established | [ ] |
| CHK029 | CLR-004: locked documents | [testability] SC-003 requires being seen FAILING first against today's behaviour, so the fix is proven rather than assumed | [ ] |
| CHK030 | CLR-002: perfil_maker is scoped | [consistency] A per-organization profile beside a global identity does not contradict feature 000's "identity is global, role is per organization" — it applies it | [ ] |
| CHK031 | Rich text = Lexical | [feasibility] Choosing the framework default adds nothing to the locked stack (Principle 1), and the cost — Lexical JSON rather than portable text — is stated for feature 003 rather than discovered by it | [ ] |
