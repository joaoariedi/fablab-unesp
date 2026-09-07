# Requirements Checklist: 002-cms-conteudo
<!-- Auto-generated from spec.md by /speckit.specify -->

Requirement **quality** checks — is the requirement well-formed? — not implementation tests.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: five content collections | [completeness] Each collection's fields trace to a page spec's "Modelo de conteúdo", not to invention | [x] |
| CHK002 | FR-001: PT-BR labels | [clarity] Site content is PT-BR and code is English (constitution Principle 4); the requirement says which side field labels fall on | [x] |
| CHK003 | FR-002: categories per organization | [consistency] Does not contradict the page specs, which list CITe's categories as examples rather than as a fixed set | [x] |
| CHK004 | FR-004: scope declaration | [testability] The registry test already fails on an undeclared collection, so pass/fail exists before the code does | [x] |
| CHK005 | FR-005: usuario stays global | [consistency] Agrees with feature 000's "identity is global, role is per organization" rather than re-deciding it | [x] |
| CHK006 | FR-006: query constraint, never boolean | [clarity] Stated as feature 000 states it, so the rule is one rule and not two similar ones | [x] |
| CHK007 | FR-008: review workflow | [completeness] All three states and the transition that is privileged are named | [x] |
| CHK008 | FR-009: idempotent approval | [testability] SC-004 gives it a concrete sequence — publish, unpublish, republish — rather than "should not double-credit" | [x] |
| CHK009 | FR-011: format allowlists | [completeness] Every extension is enumerated per field group; no "and similar formats" | [x] |
| CHK010 | FR-012: size caps | [clarity] A named constant, not a number repeated per field — so the cap can be found and changed in one place | [x] |
| CHK011 | FR-013: generated object keys | [testability] SC-008 names two concrete hostile filenames rather than "sanitise input". Ticked on the wording, which does name both filenames. The implementation gap — the generated key has no production caller — is recorded on CHK035, where it belongs | [x] |
| CHK012 | FR-014: bytes over extension | [feasibility] Achievable for images; CLR-003 acknowledges it is NOT achievable in the same sense for 3D formats, rather than pretending it is. Post-D1 the byte check is Payload own `checkFileRestrictions`, driven in `tests/uploads/native-upload.test.ts`; the CLR-003 acknowledgement for 3D formats is unchanged, and `lib/uploads/verify.ts` signature table is dormant | [x] |
| CHK013 | FR-015/FR-016: anonymous downloads | [consistency] An anonymous WRITE to a scoped collection does not contradict the tenancy rules — the requirement names how it resolves its organization | [x] |
| CHK014 | FR-017: no anonymous like | [consistency] Sits beside FR-015's open downloads without conflict; the two differ deliberately and the spec says so | [x] |
| CHK015 | FR-018: Payload internal collections | [completeness] Names the specific risk (`payload-locked-documents` enumerating document IDs) rather than "audit Payload's tables" | [x] |
| CHK016 | FR-018: inherited from feature 000 | [consistency] Feature 000 deferred this decision to this feature in writing; the requirement picks it up rather than re-opening it | [x] |
| CHK017 | FR-019: storage swap | [testability] SC-011 requires a clean `git diff` after the swap, so "config only" is checkable | [x] |
| CHK018 | FR-020: derived counters | [completeness] A maintenance strategy is required and required to be uniform — the spec does not leave each counter to invent its own | [x] |
| CHK019 | FR-021: admin shows one organization | [completeness] Relationship pickers are named explicitly, since that is the surface a scoped list view does not cover by itself | [x] |
| CHK020 | FR-022: relations to feature 005 | [clarity] Declaring the field now and the target later is stated as a deliberate choice with its reason, not left ambiguous. **Amended by D2**: the choice was reversed rather than left ambiguous — FR-022 carries the reversal and its reason (`InvalidFieldRelationship` on a `relationTo` naming an absent collection) in the requirement itself | [x] |
| CHK021 | FR-024: choke point preserved | [consistency] The feature-000 boundary is restated as inherited, not re-derived with different words | [x] |
| CHK022 | SC-003: locked documents | [testability] Requires being seen FAILING first against today's behaviour — the "gate nobody has watched fail" rule from feature 001. The gate exists and is driven from `scopedCollections()` rather than a hand-written list, with a subject guard asserting `payload-locked-documents` is still in the config. The red-first observation is T045 recorded cycle, not re-observable from the tree | [x] |
| CHK023 | Scope boundary vs 003 | [clarity] This feature ships the model, not the pages that render it | [x] |
| CHK024 | Scope boundary vs 004 | [clarity] Sign-up, login and the avatar builder are excluded. **Resolved by CLR-002**: `perfil_maker` is created here with the two fields content needs; 004 adds the avatar to the same collection rather than reshaping it | [x] |
| CHK025 | Scope boundary vs 005 | [clarity] XP and skills are excluded. **Resolved by CLR-001**: this feature writes no XP; it records approval idempotently and 005 reads it | [x] |
| CHK026 | CLR-003: upload depth | [feasibility] Resolved as magic bytes and size with no server-side parse, and the residual risk is NAMED (a `.glb` is verified as a container, never as a model) rather than left implied. Resolved as measured: magic bytes and size with no server-side parse, and the residual risk is named in CLR-003 itself. D1 moved the byte check from `verify.ts` into Payload own sniff, which parses nothing either | [x] |
| CHK027 | Decisions taken | [consistency] All four are PO decisions already dated in the page specs, quoted rather than re-decided | [x] |
| CHK028 | SC-012: gates grow | [consistency] Agrees with the constitution's "the gate set grows, never shrinks" and with what features 000 and 001 established | [x] |
| CHK029 | CLR-004: locked documents | [testability] SC-003 requires being seen FAILING first against today's behaviour, so the fix is proven rather than assumed. Same basis as CHK022: `tests/tenancy/locked-documents.test.ts`, driven from the registry so a collection added later is covered by omission rather than by memory | [x] |
| CHK030 | CLR-002: perfil_maker is scoped | [consistency] A per-organization profile beside a global identity does not contradict feature 000's "identity is global, role is per organization" — it applies it | [x] |
| CHK031 | Rich text = Lexical | [feasibility] Choosing the framework default adds nothing to the locked stack (Principle 1), and the cost — Lexical JSON rather than portable text — is stated for feature 003 rather than discovered by it | [x] |
