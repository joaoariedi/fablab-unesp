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
# Measured on 2026-08-25, and it contradicted the plan. Isolation on the SIGNED-IN path is
# enforced by THREE independent layers, so mutating any single one leaves the harness green:
#
#   layer               where                                    surface that proves it
#   plugin composition  payload.config.ts userHasAccessToAllTenants  localApiAsRsc
#   access constraint   lib/tenancy/access.ts                        localApiAsRsc
#   choke-point filter  lib/tenancy/client.ts  byTenant()            chokePoint
#
# The anonymous path has none of those and one of its own — see the fourth layer below.
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
# ── Why the public path is a FOURTH layer with a harness of its own (T013, SC-002) ────────
#
# `getPublicScopedPayload` runs with `overrideAccess: true`, so neither the plugin
# composition nor the access constraint is consulted on it at all — the two layers above are
# not merely redundant there, they are absent. It is also the first client to serve
# ANONYMOUS traffic, which is what makes a slip on it a public, silent leak rather than an
# error somebody sees. Its own layer, therefore, and it strips nothing first: the
# published-only filter is the only thing between a logged-out visitor and every draft in
# the organization, so removing it alone must be enough to turn something red.
#
# It also fails through a different harness. `isolation.test.ts` never calls the public
# client, so it stays green no matter what happens here — which is exactly the shape of hole
# this script exists to close. Hence HARNESS/EXPECT/EVIDENCE per layer rather than one
# hardcoded test file and one hardcoded leak message.
#
# Usage:  scripts/isolation-mutation.sh choke-point
#         scripts/isolation-mutation.sh access-composition
#         scripts/isolation-mutation.sh public-path
set -euo pipefail

LAYER="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"

# EXPECT names the failing SURFACE (a test title); EVIDENCE is an assertion message that can
# only appear when the assertion actually fired. Both are needed: a database that failed to
# start also prints every test title, so EXPECT alone would call a broken run a proof.
case "$LAYER" in
  choke-point)
    HARNESS="tests/tenancy/isolation.test.ts"
    EXPECT="via chokePoint"
    EVIDENCE="leaked [0-9]+ row"
    ;;
  access-composition)
    HARNESS="tests/tenancy/isolation.test.ts"
    EXPECT="via localApiAsRsc"
    EVIDENCE="leaked [0-9]+ row"
    ;;
  public-path)
    HARNESS="tests/tenancy/public-read.test.ts"
    EXPECT="filters to publicado"
    EVIDENCE="unpublished rows were served"
    ;;
  *)
    echo "usage: $0 <choke-point|access-composition|public-path>" >&2
    exit 64
    ;;
esac

# Restored from byte-for-byte copies rather than `git checkout --`. `public-payload.ts`
# arrives with feature 002, and on the branch that adds it the file is still UNTRACKED —
# `git checkout --` fails on an untracked path, the `|| true` swallowed the failure, and a
# local run would have left the mutation sitting in the working tree for someone to commit.
# Measured on this branch, 2026-09-06. A copy has no such opinion about what git knows.
restore() {
  local target
  for target in "${TARGETS[@]}"; do
    cp "$BACKUP/${target//\//_}" "$ROOT/$target"
  done
  rm -rf "$BACKUP"
}

# Every file any layer may mutate — the list restore() walks, so a new mutation target that
# is not listed here is a mutation that survives the run.
TARGETS=(
  apps/web/lib/tenancy/client.ts
  apps/web/lib/tenancy/access.ts
  apps/web/lib/tenancy/public-payload.ts
  apps/web/payload.config.ts
)

BACKUP="$(mktemp -d)"
for target in "${TARGETS[@]}"; do
  cp "$ROOT/$target" "$BACKUP/${target//\//_}"
done
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

mutate_public_path() {
  # Nothing is stripped first, unlike choke-point: the outer two layers do not run on this
  # path at all (see the header). The published-only filter stands alone.
  #
  # The mutation empties the filter rather than removing it, because `publishedOnly` now
  # returns `Where` and not `Where | undefined`: the allow-list refuses a collection it cannot
  # filter instead of serving it unfiltered, so "no filter" stopped being a value the function
  # can return. An empty `Where` is the same leak expressed in the shape the type permits —
  # every row of the collection, published or not.
  perl -0pi -e "s/return \{ status: \{ equals: PUBLISHED_STATUS \} \} as Where/return {} as Where \/* MUTATED *\//" \
    "$WEB/lib/tenancy/public-payload.ts"
  grep -q "MUTATED" "$WEB/lib/tenancy/public-payload.ts" || { echo "public-payload.ts mutation did not apply — the marked expression moved" >&2; exit 1; }
}

if [ "$LAYER" = "public-path" ]; then
  mutate_public_path
elif [ "$LAYER" = "choke-point" ]; then
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
(cd "$WEB" && npx vitest run "$HARNESS" --reporter=verbose) > "$OUT" 2>&1
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

if ! grep -qE "$EVIDENCE" "$OUT"; then
  echo "FAIL: no '$EVIDENCE' assertion fired — something else broke (setup? database?)." >&2
  tail -40 "$OUT" >&2
  exit 1
fi

echo "── PASS: removing '$LAYER' made $HARNESS fail on '$EXPECT' with '$EVIDENCE'."

# awk, not `grep | head`. Under `set -o pipefail` a pipeline whose reader exits first leaves
# the writer with SIGPIPE, and the whole script then exits non-zero AFTER announcing PASS.
# It is timing-dependent, so it passed locally and failed on CI's slower I/O — and it only
# appeared once the harness grew to five surfaces and produced more than four leak lines.
# A gate that fails intermittently for a reason unrelated to what it tests is worse than no
# gate: it teaches people to ignore it.
awk -v pat="$EVIDENCE" '$0 ~ pat && n++ < 4' "$OUT"

exit 0
