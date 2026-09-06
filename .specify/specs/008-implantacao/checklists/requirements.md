# Requirements Checklist: 008-implantacao
<!-- Auto-generated from spec.md by /speckit.specify -->
<!-- Date: 2026-09-06 -->

Requirement *quality* checks. The recurring failure mode this project has measured — a gate that
reports success while checking nothing — is unusually easy to reproduce in a deployment feature,
where "configured" reads like "working". Several rows below exist only to close that gap.

| ID | Requirement (from FR) | Quality Check | Status |
|----|----------------------|---------------|--------|
| CHK001 | FR-001: production stack | Is "development-only conveniences removed" enumerated, or left to judgement? [clarity] | [ ] |
| CHK002 | FR-002: TLS | Is renewal covered, not just issuance? A certificate that expires in 90 days passes an issuance-only check. [completeness] | [ ] |
| CHK003 | FR-003: body-size limit | Does it state the limit must match the storage caps, and name where both live? [consistency] | [ ] |
| CHK004 | FR-004: header hygiene | Is this stated as a production assertion, given feature 000 only ever tested it locally? [testability] | [ ] |
| CHK005 | FR-005: image pipeline | Is tag immutability required, or only tagging? [clarity] | [ ] |
| CHK006 | FR-006: one deploy command | Is "documented" defined as executable by a second person? [testability] | [ ] |
| CHK007 | FR-007: migrations before traffic | Is the ordering stated as a requirement, not as an implementation detail? [clarity] | [ ] |
| CHK008 | FR-008: concurrent deploys | Is the failure mode named, or does it read as a nice-to-have? [completeness] | [ ] |
| CHK009 | FR-009: failed deploy | Is "previous version serving" distinguished from "deploy reported failure"? [clarity] | [ ] |
| CHK010 | FR-010: rollback | Is it one command, and is the previous tag guaranteed to still exist? [feasibility] | [ ] |
| CHK011 | FR-011: secrets | Does the requirement account for the hook that blocks agent writes to `.env`? [feasibility] | [ ] |
| CHK012 | FR-012, FR-013: backups | Is the destination required to be *named*, so it cannot stay abstract through implementation? [clarity] | [ ] |
| CHK013 | FR-012, FR-013 | Is retention a stated period rather than "defined later"? [completeness] | [ ] |
| CHK014 | FR-013 | Are objects covered as well as the database — a `pg_dump` alone loses every upload? [completeness] | [ ] |
| CHK015 | FR-014: restore drill | Is performing the restore required, as opposed to configuring backups? [testability] | [ ] |
| CHK016 | FR-014 | Is the elapsed time recorded, so recovery time is a known number rather than a hope? [completeness] | [ ] |
| CHK017 | FR-015: uptime monitoring | Is it required to be external to the host? [clarity] | [ ] |
| CHK018 | FR-015 | Is the alert channel one a named person actually reads, rather than an unattended mailbox? [feasibility] | [ ] |
| CHK019 | FR-016: healthcheck | Does it fail when the app cannot *serve*, not merely when the process is alive? [testability] | [ ] |
| CHK020 | FR-017: disk and quota | Is the threshold a number, and is it before exhaustion rather than at it? [clarity] | [ ] |
| CHK021 | FR-018: log retention | Is the bound stated in size or age? [clarity] | [ ] |
| CHK022 | FR-019: orphan reaper | Is the production mechanism named — lifecycle rule or job — since they fail differently? [clarity] | [ ] |
| CHK023 | FR-020: first seed | Does it require exactly one organization, given more than one disables the fallback? [consistency] | [ ] |
| CHK024 | FR-020 | Are the real domains part of the seed, since tenancy resolves from the host? [completeness] | [ ] |
| CHK025 | FR-021: seed refusal | Is "non-empty" defined precisely enough to implement? [clarity] | [ ] |
| CHK026 | FR-022: runbooks | Is each runbook tied to a scenario someone will actually face at 3am? [feasibility] | [ ] |
| CHK027 | FR-023: swappability | Is Principle 1 restated as a *verifiable* criterion rather than an aspiration? [testability] | [ ] |
| CHK028 | SC-008 | Is every alert required to be verified by causing its condition? [testability] | [ ] |
| CHK029 | SC-010 | Is the second-person standard the same one feature 000's CHK019 set? [consistency] | [ ] |
| CHK030 | SC-012 | Does the secret scan extend to image layers, not only the repository? [completeness] | [ ] |
| CHK031 | CLR-001..003 | Are all three recognised as blocking, so planning does not start on a host nobody has? [feasibility] | [ ] |
| CHK032 | CLR-004 | Does the correction to `infra/docker-compose.yml`'s comment have an owner? [completeness] | [ ] |
| CHK033 | Whole spec | Does anything here duplicate what feature 007 legitimately owns? [consistency] | [ ] |
| CHK034 | Whole spec | Does every SC name evidence a command or a person produces? [testability] | [ ] |
