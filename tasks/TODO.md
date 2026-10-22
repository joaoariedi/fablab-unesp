# TODO

## 🛡 FAB-1 — Upgrade dependencies to clear the pnpm audit advisories (10 critical)

`pnpm audit` on `dev` (2026-10-22) reports 76 advisories: 9 low, 28 moderate, 29 high,
10 critical. The critical ones include Next.js RCE (next/og ImageResponse, Image
Optimization SVG, `use cache` typed arrays), Payload field access-control bypass on
auth collections, unauthorized document update and auth token handling, Vitest UI
arbitrary file read/exec, Tinypool prototype-pollution RCE (two), and a DOMPurify
SAFE_FOR_TEMPLATES bypass.

Done when `pnpm audit --audit-level critical` and `--audit-level high` exit 0, and lint,
typecheck and the full test suite still pass.

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
