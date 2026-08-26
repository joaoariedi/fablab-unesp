#!/usr/bin/env bash
#
# Proves the cross-tenant isolation harness CAN FAIL (SC-011, T064).
#
# A harness that has only ever been observed green is evidence of nothing. This breaks one
# layer of the isolation on purpose and asserts the harness notices — by test name, not by
# exit code, because a database that failed to start also exits non-zero and would otherwise
# be indistinguishable from a working proof.
#
# ── Why this takes a LAYER argument ───────────────────────────────────────────────────────
#
# Measured on 2026-08-25, and it contradicted the plan. Isolation is enforced by THREE
# independent layers, so mutating any single one leaves the harness green:
#
#   layer               where                                    surface that proves it
#   plugin composition  payload.config.ts userHasAccessToAllTenants  localApiAsRsc
#   access constraint   lib/tenancy/access.ts                        localApiAsRsc
#   choke-point filter  lib/tenancy/client.ts  byTenant()            chokePoint
#
# The first two BOTH guard localApiAsRsc, so that surface only goes red when both are
# removed. The plan's original design — patch one marked line and expect failure — would
# have passed forever while proving nothing, which is the same false assurance as a harness
# with no scoped collections.
#
# The choke-point filter is the INNERMOST layer, and that changes how it must be proven.
# `getTenantScopedPayload` runs with `overrideAccess: false` and a user, so the access
# constraint applies to the chokePoint surface too: removing only client.ts leaves the
# harness green (measured — this script caught it). Proving client.ts contributes therefore
# means removing the two outer layers FIRST and showing that chokePoint still holds, then
# removing client.ts and showing it finally leaks. That is exactly what "defence in depth"
# claims, stated as an executable assertion rather than an aspiration.
#
# Usage:  scripts/isolation-mutation.sh choke-point
#         scripts/isolation-mutation.sh access-composition
set -euo pipefail

LAYER="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"

case "$LAYER" in
  choke-point)
    EXPECT="via chokePoint"
    ;;
  access-composition)
    EXPECT="via localApiAsRsc"
    ;;
  *)
    echo "usage: $0 <choke-point|access-composition>" >&2
    exit 64
    ;;
esac

restore() {
  git -C "$ROOT" checkout -- \
    apps/web/lib/tenancy/client.ts \
    apps/web/lib/tenancy/access.ts \
    apps/web/payload.config.ts 2>/dev/null || true
}
trap restore EXIT

echo "── mutating layer: $LAYER (expecting '$EXPECT' assertions to fail)"

mutate_access_composition() {
  perl -0pi -e "s/return \{ tenant: \{ in: ids \} \} as Where/return true \/* MUTATED *\//" \
    "$WEB/lib/tenancy/access.ts"
  # NOTE: match up to but NOT including the trailing comma — the source line already ends
  # with one, and appending another produced `true, /* MUTATED */,` and a syntax error that
  # made the harness fail to COMPILE. That still exits non-zero, so a job checking only the
  # exit code would have called a broken build a successful proof.
  perl -0pi -e "s/userHasAccessToAllTenants: \(user\) => isMaster\(user as \{ role\?: string \}\)/userHasAccessToAllTenants: () => true \/* MUTATED *\//" \
    "$WEB/payload.config.ts"
  grep -q "MUTATED" "$WEB/lib/tenancy/access.ts" || { echo "access.ts mutation did not apply" >&2; exit 1; }
  grep -q "MUTATED" "$WEB/payload.config.ts" || { echo "payload.config.ts mutation did not apply" >&2; exit 1; }
}

if [ "$LAYER" = "choke-point" ]; then
  # Strip the two OUTER layers as well: with them in place the choke-point filter is
  # redundant, and its removal is invisible. See the note above.
  mutate_access_composition
  perl -0pi -e "s/isScoped\(collection\) \? \(\{ tenant: \{ equals: tenantId \} \} as Where\) : undefined/undefined \/* MUTATED *\//" \
    "$WEB/lib/tenancy/client.ts"
  grep -q "MUTATED" "$WEB/lib/tenancy/client.ts" || { echo "client.ts mutation did not apply — the marked expression moved" >&2; exit 1; }
else
  # Both layers that guard localApiAsRsc, together — see the note above.
  mutate_access_composition
fi

OUT="$(mktemp)"
set +e
(cd "$WEB" && npx vitest run tests/tenancy/isolation.test.ts --reporter=verbose) > "$OUT" 2>&1
STATUS=$?
set -e

echo "── harness exit status: $STATUS"

if [ "$STATUS" -eq 0 ]; then
  echo "FAIL: the harness passed with the '$LAYER' layer removed." >&2
  echo "      It is not detecting the leak it exists to detect." >&2
  tail -40 "$OUT" >&2
  exit 1
fi

# Non-zero is necessary but NOT sufficient: a missing database exits non-zero too. Require
# the failure to name the surface this layer actually protects.
if ! grep -q "$EXPECT" "$OUT"; then
  echo "FAIL: the harness failed, but not for the right reason." >&2
  echo "      Expected failing assertions naming '$EXPECT'." >&2
  tail -40 "$OUT" >&2
  exit 1
fi

if ! grep -qE "leaked [0-9]+ row" "$OUT"; then
  echo "FAIL: no leak assertion fired — the failure was something else (setup? database?)." >&2
  tail -40 "$OUT" >&2
  exit 1
fi

echo "── PASS: removing '$LAYER' made the harness fail on '$EXPECT' with a row leak."
grep -E "leaked [0-9]+ row" "$OUT" | head -4
