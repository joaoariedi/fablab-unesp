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
