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
# ── Why the WRITE side is a FIFTH layer with a harness of its own (T036, SC-008) ──────────
#
# Every layer above is a READ. They answer "can this session see another organization's
# rows", and they all answer it correctly about a row whose relationship already points
# across the boundary: the bad reference is in the database, and each read client dutifully
# filters the neighbour's rows out of the result. The leak is not in what is served, it is in
# what was accepted.
#
# Spike S4c measured that acceptance live — `payload.update` moved a row in A to point at a
# row in B and the write SUCCEEDED — which is why `lib/tenancy/same-tenant-validator.ts` is
# project code at all: the plugin does not do it. Until this layer existed it was the only
# isolation guard in the repo that had never been watched fail.
#
# None of the four layers above inspects the CONTENTS of a relationship value, so nothing
# there is redundant with this. But the validator is not one expression either, and that was
# measured rather than assumed (2026-09-12): neutering the tenant comparison ALONE leaves the
# integration surface GREEN. `sameTenant` ends by delegating to Payload's own
# `validations.relationship`, and the multi-tenant plugin injects a `filterOptions` onto every
# scoped -> scoped relationship field, which that delegation then enforces — so the plugin's
# filter is not an independent layer, it is reachable only BECAUSE our validator calls into
# it, a declared `validate` having replaced the default rather than composed with it. Hence
# two mutations: the comparison and the delegation. Same lesson as `choke-point`, in a new
# place — a layer that cannot be observed failing has not been proven.
#
# What it deliberately leaves standing is the `required` floor: `defaultRelationshipRefusal`
# runs first and is untouched, so the two composition tests stay green and every assertion
# that turns red is a tenancy assertion. A mutation that reddens a whole file proves the file
# runs; this one proves the guard guards.
#
# And it fails through a third harness. `tests/tenancy/relationships.test.ts` is the only
# suite that drives a cross-tenant write; `isolation.test.ts` and `public-read.test.ts` stay
# green no matter what happens to the validator, which is the same shape of hole the public
# path had.
#
# Usage:  scripts/isolation-mutation.sh choke-point
#         scripts/isolation-mutation.sh access-composition
#         scripts/isolation-mutation.sh public-path
#         scripts/isolation-mutation.sh same-tenant
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
  same-tenant)
    HARNESS="tests/tenancy/relationships.test.ts"
    EXPECT="refuses a row in A pointing at a row in B"
    EVIDENCE="the S4c hole is open"
    ;;
  *)
    echo "usage: $0 <choke-point|access-composition|public-path|same-tenant>" >&2
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
  apps/web/lib/tenancy/same-tenant-validator.ts
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

mutate_same_tenant() {
  # Neither the function nor its import is deleted: that fails the harness on a module error,
  # which is indistinguishable from a typo and proves nothing about isolation. Both halves of
  # the REFUSAL go instead, and the validator keeps running, keeps being called by Payload on
  # every write, and answers `true` to a reference into another organization — precisely the
  # shape spike S4c measured, a write that is accepted rather than one that errors elsewhere.
  #
  # 1/2 — the tenant comparison itself.
  perl -0pi -e "s/if \(targetTenant !== ownTenantId\) \{/if (false) { \/* MUTATED *\//" \
    "$WEB/lib/tenancy/same-tenant-validator.ts"
  # 2/2 — the delegation, which is the ONLY route to the plugin's injected `filterOptions` and
  # therefore catches the cross-tenant update on its own if it is left in place. Measured: with
  # only 1/2 applied, `refuses a row in A pointing at a row in B` stayed green.
  perl -0pi -e "s/return payloadRelationshipRefusal\(value, options\)\.then\(\(refusal\) => refusal \?\? true\)/return true \/* MUTATED *\//" \
    "$WEB/lib/tenancy/same-tenant-validator.ts"
  # Two applications, so count them: one pattern matching and the other silently missing is the
  # exact drift that would leave the harness green and this script announcing a proof.
  [ "$(grep -c "MUTATED" "$WEB/lib/tenancy/same-tenant-validator.ts")" -eq 2 ] || {
    echo "same-tenant-validator.ts: expected 2 mutations, got $(grep -c "MUTATED" "$WEB/lib/tenancy/same-tenant-validator.ts") — a marked expression moved" >&2
    exit 1
  }
}

if [ "$LAYER" = "public-path" ]; then
  mutate_public_path
elif [ "$LAYER" = "same-tenant" ]; then
  # No outer layer is stripped first: the read guards do not look at a relationship's contents
  # at all. The two expressions this removes are both inside the validator — see the header.
  mutate_same_tenant
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
