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
# ── Why the LEDGER is a SIXTH layer, and why it strips the write guard first (T047, FR-035) ─
#
# Every layer above mutates MACHINERY: the filter in `client.ts`, the constraint in `access.ts`,
# the anonymous read, the relationship validator. None of them touches a CALLER'S CHOICE OF
# CLIENT, because until `creditXp` no caller had a choice worth making. It is the first module
# that resolves a GLOBAL identity (`progressoAula.usuario`) to a SCOPED profile and then writes
# a total to it, so reaching for a broader client is a mistake available here and nowhere else
# (D7). Pinning that choice to another organization compiles, typechecks, and credits XP at a
# lab nobody acted in — where the damage is not a row leaking into a list but a row MINTED, with
# every projection downstream inheriting it as if it had been earned.
#
# It also fails through a harness of its own. `isolation.test.ts` asks what a user can SEE, and
# `xpLedger` is already a row in that matrix — it stays green wherever a credit lands, because
# a correctly filtered read of a wrongly written row is still correctly filtered. Only
# `xp-isolation.test.ts` drives an ACTION and measures both labs either side of it.
#
# The mutation pins the host to organization B's, so a maker of A earns into B: the sentence
# FR-035 and SC-010 are written in. Pinning a FIXTURE host is the one place in this script where
# a mutation depends on a test's data, and it is deliberate — a leak has to name a destination,
# and "the other lab" is not something the patched expression can compute. The coupling is
# guarded rather than trusted: the host is checked against `tests/tenancy/fixtures.ts` BEFORE
# anything is patched, so a renamed fixture host fails loudly instead of quietly mutating a
# credit that still lands in the right place.
#
# ── Why this layer strips THREE outer layers first ───────────────────────────────────────────
#
# The same reason `choke-point` removes the two layers outside it: each of them refuses the
# mis-scoped credit for a reason that is NOT "the credit landed at the wrong lab", so leaving one
# standing buys a red that re-proves a layer already proven, while the EVIDENCE below never
# prints. Both refusals were MEASURED on 2026-09-16 by T048, and the second contradicted what
# this header previously claimed.
#
# 1/2 — the write guard (`same-tenant`). A mis-scoped credit writes an `xpLedger` row whose
# `tenant` is B and whose `perfil` and `skill` point into A, and both of those fields carry
# `validate: sameTenant`. The validator REFUSES the row, `creditXp` rethrows, and the harness goes
# red on "the credit at A raised …" with nothing having moved anywhere. Reasoned at T047 from
# `same-tenant-validator.ts` and `XpLedger.ts`.
#
# 2/2 — the two READ layers (`access-composition`). This half was reasoned WRONG at T047, which
# stripped the write guard alone and shipped a layer that proved nothing. T048 ran it: the harness
# still went red on "the credit at A raised …", now carrying
#
#     Error: no regrasXp row with a numeric xpPorAcao … in this organization, so there is no
#     economy to credit at (got undefined from 0 row(s))
#
# `creditXp`'s FIRST act is not the write at all — it is `rulesForTenant(store)`, a READ of
# `regrasXp` through the mis-scoped client while `req.user` is still a maker of A. The access
# constraint and the plugin composition both guard that read, so B's economy is filtered out, the
# credit dies before it creates anything, and no lab's numbers move for the harness to see. The
# write guard was never even reached. A mutation refused by a layer ABOVE the one under test is
# the exact false assurance this script exists to prevent, and only running it found this one.
#
# What the three removals deliberately leave standing is `client.ts`'s choke-point filter, and
# that is the point: it is the layer that reads a client's tenant and confines every operation to
# it, so with the other three gone the ONLY thing deciding which lab is credited is the client
# `creditXp` chose. The control was run alongside (2026-09-16) — all three outer layers stripped
# and `creditXp`'s choice left ALONE, harness 12/12 green. The red belongs to the choice and to
# nothing else, which is what D7 claims and what this layer now actually proves.
#
# EVIDENCE here is a rendered NUMBER, not a phrase. Vitest prints a code frame of the failing
# file, so an EVIDENCE that also matched the message TEMPLATE would be satisfied by any failure
# in that file — a database that never started included. `moved by 3 while a maker of` can only
# come from a delta the assertion computed, and `tests/isolation-mutation-layers.test.ts`
# asserts exactly that property of this string.
#
# Usage:  scripts/isolation-mutation.sh choke-point
#         scripts/isolation-mutation.sh access-composition
#         scripts/isolation-mutation.sh public-path
#         scripts/isolation-mutation.sh same-tenant
#         scripts/isolation-mutation.sh xp-ledger
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
  xp-ledger)
    HARNESS="tests/tenancy/xp-isolation.test.ts"
    EXPECT="a credit earned at A moves nothing at B"
    EVIDENCE="moved by -?[1-9][0-9]* while a maker of"
    ;;
  *)
    echo "usage: $0 <choke-point|access-composition|public-path|same-tenant|xp-ledger>" >&2
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
  apps/web/lib/content/xp.ts
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

# The fixture host the mutation pins the credit to. Named here rather than inline so the guard
# below and the substitution cannot drift apart into two different labs.
XP_LEAK_HOST="org-b.localhost"

mutate_xp_ledger() {
  # Checked BEFORE the patch, not after: a renamed fixture host would otherwise produce a
  # mutation that applies cleanly, resolves nothing, and leaves the credit exactly where it
  # belonged — a green harness reported as a proof.
  grep -q "$XP_LEAK_HOST" "$WEB/tests/tenancy/fixtures.ts" || {
    echo "the xp-ledger layer pins the credit to '$XP_LEAK_HOST', which tests/tenancy/fixtures.ts no longer builds" >&2
    exit 1
  }
  # The choice of client, and nothing else — `creditXp` keeps running, keeps writing through a
  # real scoped client, and keeps returning true. What changes is WHICH lab the client belongs
  # to, which is the whole of D7: a caller reaching past its own request for a broader or
  # different tenant. Deleting the call instead would fail the harness on a module error, which
  # is indistinguishable from a typo and proves nothing about tenancy.
  perl -0pi -e "s/const getStore = deps\.getStore \?\? \(\(req: PayloadRequest\) => getTenantScopedPayload\(req\)\)/const getStore = deps.getStore ?? ((req: PayloadRequest) => getTenantScopedPayload(req, { host: '$XP_LEAK_HOST' })) \/* MUTATED *\//" \
    "$WEB/lib/content/xp.ts"
  grep -q "MUTATED" "$WEB/lib/content/xp.ts" || {
    echo "xp.ts mutation did not apply — creditXp's choice of client moved (see tests/content/xp-mutation-point.test.ts)" >&2
    exit 1
  }
}

if [ "$LAYER" = "public-path" ]; then
  mutate_public_path
elif [ "$LAYER" = "same-tenant" ]; then
  # No outer layer is stripped first: the read guards do not look at a relationship's contents
  # at all. The two expressions this removes are both inside the validator — see the header.
  mutate_same_tenant
elif [ "$LAYER" = "xp-ledger" ]; then
  # Three outer layers go FIRST, in the order the credit meets them — see the header. The two
  # read layers guard `rulesForTenant`, which `creditXp` reaches before it writes anything; the
  # write guard then refuses the row itself. With either standing the credit is refused rather
  # than misplaced, and no lab's numbers move for the harness to see.
  mutate_access_composition
  mutate_same_tenant
  mutate_xp_ledger
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
