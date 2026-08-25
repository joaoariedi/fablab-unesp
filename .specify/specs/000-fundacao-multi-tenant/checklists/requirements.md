# Requirements Checklist: fundacao-multi-tenant
<!-- Auto-generated from spec.md by /speckit.specify -->

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001/002: workspace + embedded Payload | [completeness] Layout matches the constitution's monorepo (apps/web, packages/game, packages/ui, infra/) | [ ] |
| CHK002 | FR-003/006: env-only service swap | [testability] SC-008 runs the suite against an alternate `.env` with zero source diffs | [ ] |
| CHK003 | FR-004: committed migrations | [testability] A clean database reaches the current schema by applying committed migrations only | [ ] |
| CHK004 | FR-005: pinned versions | [completeness] Next, Payload and the plugin have exact pins recorded, with the upgrade policy referenced | [ ] |
| CHK005 | FR-007: plugin before content collections | [consistency] No content collection exists in this branch; the plugin is configured first | [ ] |
| CHK006 | FR-008: organizations collection | [completeness] Slug is unique **and** immutable after creation; status and quota fields present even if unused here | [ ] |
| CHK007 | FR-009: minimal users collection | [consistency] One e-mail = one account globally; role lives per membership, not per user | [ ] |
| CHK008 | FR-010: seed-on-create | [testability] Creating an organization copies defaults; nothing resolves through a global fallback at read time | [ ] |
| CHK009 | FR-011/012: host resolution + sovereign fallback | [testability] SC-006 proves two different hosts resolve to the single organization with no master user | [ ] |
| CHK010 | FR-013/014: choke point + lint | [testability] SC-003 probe commit fails CI; allowlist entries each carry a reason comment | [ ] |
| CHK011 | FR-015: access returns query constraint | [consistency] No scoped collection returns a boolean from an access function | [ ] |
| CHK012 | FR-016: same-tenant relationship validator | [completeness] Applied to **every** relationship between scoped collections, not a sample | [ ] |
| CHK013 | FR-017/018: scope registry | [testability] SC-004 probe commit fails CI naming the unregistered collection | [ ] |
| CHK014 | FR-019: isolation harness coverage | [completeness] All four surfaces asserted: REST, Local API in RSC, admin, custom endpoints | [ ] |
| CHK015 | FR-020: red→green evidence | [testability] PR records the harness failing with the constraint removed, then passing | [ ] |
| CHK016 | FR-021: invite semantics | [testability] SC-007 compares responses for existing and non-existing e-mails; no enumeration signal | [ ] |
| CHK017 | FR-022: admin scoping by role | [completeness] Organization admins cannot see `organizations` or `users`; master can | [ ] |
| CHK018 | FR-023: gates grow, never shrink | [consistency] Docs-stage gates still present alongside the new jobs; all required on `dev` and `main` | [ ] |
| CHK019 | FR-024: README quick start | [testability] SC-001 validated by a second person on a clean machine | [ ] |
| CHK029 | FR-032: explicit-tenant system client | [completeness] Seed-on-create and invite writes use it; it is never exported from lib/tenancy/index.ts and is import-fenced | [ ] |
| CHK030 | N2: `req.payload` closed | [testability] SC-003's second probe (a hook calling `req.payload.find`) fails CI | [ ] |
| CHK031 | N3: resolution cache | [testability] Creating an org makes its host resolve immediately; a probed-then-created host never serves another org's context | [ ] |
| CHK032 | N6: pendingInvites | [consistency] Collection exists, is registered `scoped`, and no `users` row is created before acceptance | [ ] |
| CHK033 | N8: mutation job | [testability] Fails for the right reason — asserts specific isolation test IDs, not a nonzero exit | [ ] |
| CHK022 | FR-028: scoped canary collection | [testability] The harness generates ≥1 test per surface; a run with zero scoped collections is itself a failure | [ ] |
| CHK023 | FR-029: invite scope | [completeness] Delivery/token/acceptance explicitly assigned to feature 004; pending-invite rows are the documented handoff | [ ] |
| CHK024 | FR-030: packages exist with boundary | [consistency] `packages/game` has a README **and** an import-boundary rule — not an empty directory | [ ] |
| CHK025 | FR-031: seed-on-create registry | [testability] Creating an organization runs registered seeds; the test proves copy-on-create, not read-time inheritance | [ ] |
| CHK026 | SC-011: harness can fail | [testability] Mutation job flips the canary constraint and asserts failure on every run | [ ] |
| CHK027 | SC-012: tenant spoofing | [testability] Forged `x-tenant` header is stripped; resolution comes from the host | [ ] |
| CHK028 | Spike checklist S1–S5, S7 | [completeness] All six answers recorded in plan.md **before** collections are written (S6 retired — FR-029 creates no `users` row before acceptance) | [ ] |
| CHK020 | Clarification 1: routing shape | [completeness] Domain/subdomain decision recorded before deployment work begins | [ ] |
| CHK021 | Clarification 2: slug/field language | [consistency] Decided before the first collection is created — renaming later requires migrations | [ ] |
