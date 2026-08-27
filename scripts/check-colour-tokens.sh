#!/usr/bin/env bash
#
# The colour fence, CSS half (FR-002, CLR-001, SC-001, T007b).
#
# ESLint does not lint `.css` at all, and components are styled with CSS Modules — so the
# `no-restricted-syntax` rule in eslint.config.mjs guards the surface a hex is *least* likely
# to be written on. This covers the other one. Run by the `check-colour-tokens` CI job;
# `pnpm lint` is `eslint .` and executes no shell scripts.
#
# Two things are forbidden outside the token layer:
#
#   * a raw colour — `#hex`, `rgb()`/`rgba()`, `hsl()`/`hsla()`
#   * `--color-rosa-raw`, the PRIVATE default behind `--color-primary` (CLR-001)
#
# The second is the one the eye misses. Review round 2 found that token banned only in
# TypeScript, leaving it free in the single file type a component would ever write it in.
# A `Card.module.css` painted with the raw pink renders IDENTICALLY to a correct one for
# CITe, passes every test, and fails to co-brand only once a second organization exists.
#
# ── The exit contract ─────────────────────────────────────────────────────────────────────
#
# `grep` exits 1 when it finds NOTHING, which is this gate's SUCCESS case. The first draft
# piped grep straight into the exit status and, under `set -o pipefail`, returned 1 on a
# clean tree AND on a dirty one — a gate that could never tell pass from fail (measured in
# round 2; the same defect class as feature 000's `grep | head`). Hits are captured into a
# variable and the script branches on emptiness instead.
#
# `|| true` is what makes that safe, and it is also this script's other hazard: it swallows
# grep's exit 2 ("no such file") exactly as cleanly as it swallows "no matches". A renamed
# directory would leave a gate that scans zero files and reports PASS forever. Hence the
# scan roots are verified to exist before the scan, rather than after.
set -euo pipefail

# Self-locating: CI runs this from the repo root, a developer runs it from wherever they
# are, and a cwd-relative scan would quietly find no `.css` and pass.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# The one place a colour may be written. Kept in step with the `ignores` of the TypeScript
# half, and deliberately this exact path rather than any directory named `tokens/`: the
# exemption stays a single reviewed path, so `apps/web/app/tokens/` cannot adopt it by name.
TOKENS_DIR='packages/ui/src/tokens/'

# Where component colour lives. `apps/web` owns the layout, the theme resolution and every
# page; leaving it out would fence the library and free the application.
SCAN_ROOTS=(packages/ui/src apps/web)

# `.next` holds minified vendor CSS after any local `next build` — thousands of hexes nobody
# wrote. Scanning it fails the gate for every developer who has ever built, which is how a
# gate gets deleted instead of fixed. `node_modules` is the same argument.
SKIP_DIRS=(--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist)

RAW_COLOUR='#[0-9a-f]{3,8}\b|rgba?\(|hsla?\('
PRIVATE_TOKEN='--color-rosa-raw'

for dir in "${SCAN_ROOTS[@]}"; do
  if [ ! -d "$dir" ]; then
    echo "FAIL: $dir does not exist, so this gate would scan nothing and report PASS." >&2
    echo "      A scan root was renamed or moved; update SCAN_ROOTS in $0." >&2
    exit 2
  fi
done

hits=$(grep -rnEi "$RAW_COLOUR|$PRIVATE_TOKEN" \
         --include='*.css' "${SKIP_DIRS[@]}" "${SCAN_ROOTS[@]}" \
       | grep -vE "^$TOKENS_DIR" || true)

if [ -z "$hits" ]; then
  echo "── PASS: no raw colour or private token in CSS outside $TOKENS_DIR"
  exit 0
fi

echo "FAIL: raw colour or private token in CSS outside $TOKENS_DIR (FR-002, CLR-001)." >&2
echo "" >&2
echo "$hits" >&2
echo "" >&2
echo "      Colours are defined once, in $TOKENS_DIR, and referenced as tokens:" >&2
echo "        the per-organization accent  ->  var(--color-primary)" >&2
echo "        a platform colour            ->  var(--color-navy), var(--color-laranja), ..." >&2
echo "" >&2
echo "      --color-rosa-raw is private: it is the DEFAULT behind --color-primary, never" >&2
echo "      the accent itself. Using it renders identically for CITe and fails to" >&2
echo "      co-brand for the next organization (CLR-001)." >&2
exit 1
