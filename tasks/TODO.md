# TODO

## 🛡 FAB-4 — Finish the dependency upgrade on branch worktree-FAB-1 and open its PR

Split from FAB-1, which stalled. Branch `worktree-FAB-1` already holds the bumps: Vitest
3.2.4 → 4.1.12, Next 16.3.3 → 16.4.1, Payload and every `@payloadcms/*` 3.88.0 → 3.91.0
in lockstep, sharp 0.35.5, the `monaco-editor>dompurify` override, refreshed transitives,
and `apps/web/tests/dependency-pins.test.ts`. Spec, plan and tasks are in
`.specify/specs/009-auditoria-dependencias/` on that branch (T001–T006 and T010 done).

Build on that branch, not on a fresh one from `dev`. What is left: the Payload 3.88 → 3.91
auth/access release-note check (T009), the `CHANGELOG.md` Security entry (T012), the
`docs/backlog.md` notes for the merge-blocking audit job (T011) and for braces
GHSA-vfj7-8cjw-p6xm, the final gate without the database (T013 minus migration drift and
the DB-backed tests, which are FAB-5), and `/security-review` over the diff (T014).

Done when `pnpm audit --audit-level critical` exits 0, `--audit-level high` exits 0 except
braces GHSA-vfj7-8cjw-p6xm (no patched release; tracked as FAB-6), lint, typecheck and the
non-DB tests pass, and the PR is open against `dev`.

## FAB-2 — Install semgrep, lizard and jscpd so the SAST and complexity gates run

`/hef.quality` on 2026-10-22 skipped SAST, the complexity measurement and the duplicate-code
check because these tools are not installed. Without lizard, the complexity delta gate in
`quality-before-commit.sh` does not run either.

Done when `semgrep scan --config auto`, `lizard` and `jscpd` run in `/hef.quality`, and
their current findings on `dev` are recorded as a baseline.

## FAB-3 — Let docs-only pull requests skip the heavy CI jobs while still reporting the required checks

`.github/workflows/ci.yml` runs every job on every pull request, so a markdown-only PR (#22)
waits on `Tests`, the isolation harness, `Build` and the two Lighthouse performance jobs (up
to 45 minutes each). A plain `paths-ignore` is not the fix: the job names are the required
status checks on `dev` and `main` (`ci.yml:9`), and a skipped workflow never reports them, so
the PR would stay blocked.

Approach: a first job detects whether only docs paths changed; the heavy jobs depend on it
and finish green without running when nothing but docs changed. Job names stay unchanged.

Done when a docs-only PR gets every required check green in a few minutes, and a PR that
touches code still runs the full set.
