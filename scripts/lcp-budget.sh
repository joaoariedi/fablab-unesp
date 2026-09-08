#!/usr/bin/env bash
#
# The LCP budget gate (FR-025, SC-006, T015).
#
# The roadmap promises LCP <= 2.5s on a mid-range 4G profile, and reopens the hybrid-rendering
# decision if the promise is missed. That makes this script the only thing between the promise
# and a hero nobody weighed — so it is written against the ways a performance gate goes quietly
# blind rather than the way it goes red.
#
# ── Why the preconditions are STEPS, not assumptions ──────────────────────────────────────
#
# Seeding is part of the gate. `apps/web/seed/index.ts` gives CITe `domains: ['localhost',
# '127.0.0.1']`, and tenancy resolves from the Host header: with no seeded organization every
# route 404s, and Lighthouse measures an error page at a magnificent LCP. A gate that skips the
# seed therefore passes HARDEST exactly when the content is missing. The test suite destroys
# those rows — measured, and it has already cost this project a debugging round — so the CI job
# that runs this must own a database the test job does not share (T017).
#
# For the same reason the readiness probe demands a real 200 *with the Host header*, not merely
# a socket that accepts a connection. A 404, a 500 and a redirect all mean "do not measure this".
#
# ── Why LCP only, per URL, as a median ────────────────────────────────────────────────────
#
# LCP only: the composite performance score moves for a dozen reasons that are not the metric
# the requirement names, so a gate asserting the score fails for reasons it cannot explain and
# gets disabled. Per URL: an average across pages lets the Home hide behind five cheap ones, and
# the Home is the page at risk. Median of three: Lighthouse in CI is noisy, and a gate that
# fails randomly teaches people to ignore it — but a MEAN would import the outlier it is
# supposed to reject, so the middle sample is taken and never the average.
#
# ── Lighthouse rather than `lhci collect` ─────────────────────────────────────────────────
#
# The plan sketched `lhci collect`. Its assertion layer is built around category scores and
# writes its reports under a name it chooses; everything this gate asserts — one metric, one
# median, one named failure per URL — is computed here anyway, so the plain CLI is invoked
# directly and the report path is ours. Same engine, one less indirection to read through when
# the gate goes red.
#
# Usage:  scripts/lcp-budget.sh
#         PORT=3100 LCP_BUDGET_MS=2000 scripts/lcp-budget.sh
set -euo pipefail

# `printf '%.0f'` parses the millisecond value Lighthouse reports, and under a locale whose
# decimal separator is a comma (pt_BR is the likely one here) it refuses "1234.56" outright.
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PORT="${PORT:-3000}"
# The Host the server is asked for, which is what tenancy resolves from — not the address the
# socket is opened to. Both are seeded; keeping them separate is what lets the readiness probe
# say "127.0.0.1 answered, and it answered AS localhost".
LCP_HOST="${LCP_HOST:-localhost}"
BASE="http://${LCP_HOST}:${PORT}"
BUDGET_MS="${LCP_BUDGET_MS:-2500}"
RUNS_PER_URL=3

# Every publicly reachable page of feature 003. Logged-in surfaces are out of scope: they are
# not what SC-006 promises, and they cannot be measured without a session.
PAGES=(/ /projetos /artigos /aulas /biblioteca-3d /calendario)

# How long Lighthouse waits for a page to finish loading, PINNED rather than inherited.
#
# It is a Lighthouse default (`maxWaitForLoad: 45 * 1000`, core/config/constants.js in 12.8.2),
# and it is load-bearing twice over: an asset that cannot transfer inside it never becomes an
# LCP candidate at all, so `scripts/lcp-mutation.sh` sizes its planted hero against this number.
# A default that moves under a `lighthouse@12` minor would silently move that ceiling with it.
LCP_MAX_WAIT_MS="${LCP_MAX_WAIT_MS:-45000}"

# The bytes-per-second the profile below actually resolves to, for anything that has to reason
# about what fits inside the window. `enableNetworkThrottling` (core/lib/emulation.js) converts
# kbps to B/s as `floor(kbps * 1024 / 8)`, so 1474.56 kbps is 188,743 B/s. Not read by this
# script — declared here because this is where the profile is decided, and
# `tests/lcp-mutation.test.ts` holds the mutation's copy to it.
LCP_THROTTLE_BYTES_PER_S=188743

# The named mid-range 4G profile from the plan (Lighthouse's own `mobileSlow4G`). Written once,
# applied to every URL, so no page can be measured on a kinder network than its neighbours.
#
# ── Why both pairs of keys are here ─────────────────────────────────────────────────────────
#
# `rttMs`/`throughputKbps` are the **Lantern** keys, read only by the `simulate` method. Under
# `--throttling-method=devtools` the browser is throttled from `requestLatencyMs` and
# `downloadThroughputKbps` (`enableNetworkThrottling`, core/lib/emulation.js), which the first
# pair does not set. Passing only the Lantern pair left the flags **inert**: the measurement was
# correct anyway, because the unset keys fell back to `mobileSlow4G`'s own defaults — the same
# profile by luck, not by instruction. A test asserting those two flags was checking argv, not
# throttling, and would not have noticed the default moving.
#
# The devtools values are `mobileSlow4G`'s, derived rather than retyped:
#   requestLatencyMs       = 150 * 3.75  (DEVTOOLS_RTT_ADJUSTMENT_FACTOR)        = 562.5
#   downloadThroughputKbps = 1.6*1024 * 0.9 (DEVTOOLS_THROUGHPUT_ADJUSTMENT_FACTOR) = 1474.56
#   uploadThroughputKbps   = 750 * 0.9                                           = 675
THROTTLING=(
  --throttling-method=devtools
  --throttling.rttMs=150
  --throttling.throughputKbps=1638
  --throttling.requestLatencyMs=562.5
  --throttling.downloadThroughputKbps=1474.56
  --throttling.uploadThroughputKbps=675
  --throttling.cpuSlowdownMultiplier=4
  --max-wait-for-load="$LCP_MAX_WAIT_MS"
  --form-factor=mobile
  --screenEmulation.mobile
)

usage() {
  cat <<'USAGE'
usage: scripts/lcp-budget.sh

Measures LCP on the mid-range 4G profile for every public page, three runs each, and fails
naming any page whose median exceeds the budget (FR-025, SC-006).

It owns its preconditions: migrate, seed, build, start, and wait for a real 200 carrying the
Host header before measuring anything.

  PORT                  port the production server listens on          (default 3000)
  LCP_HOST              Host header tenancy resolves from              (default localhost)
  LCP_BUDGET_MS         per-page budget in milliseconds                (default 2500)
  LCP_WAIT_ATTEMPTS     readiness probe attempts                       (default 60)
  LCP_WAIT_INTERVAL_S   seconds between readiness attempts             (default 2)
USAGE
}

# ── measurement ───────────────────────────────────────────────────────────────────────────

# The LCP audit, in milliseconds. A report whose `largest-contentful-paint` is missing or
# non-numeric (Lighthouse writes `scoreDisplayMode: "error"` when the run fails) is an ERROR,
# never a zero: reading it as zero is how a gate stops being able to fail at all.
lcp_ms_from_report() {
  node -e '
    const fs = require("fs")
    const path = process.argv[1]
    const report = JSON.parse(fs.readFileSync(path, "utf8"))
    const audit = report && report.audits && report.audits["largest-contentful-paint"]
    const value = audit && audit.numericValue
    if (typeof value !== "number" || !Number.isFinite(value)) {
      console.error(
        `no numeric largest-contentful-paint audit in ${path} ` +
          `(got ${JSON.stringify(audit)}); the Lighthouse run failed, and a failed run is ` +
          `not a fast page`,
      )
      process.exit(1)
    }
    process.stdout.write(String(value))
  ' "$1"
}

# The middle of three samples. `sort -g` because these are floats; the middle line, never the
# mean — the mean re-imports the outlier the median exists to discard.
median_of_three() {
  printf '%s\n' "$1" "$2" "$3" | sort -g | sed -n '2p'
}

# One assertion per URL. The failure names the page AND the number, because "the performance
# budget failed" sends the next person to read this script instead of the page that regressed.
assert_lcp_at_most() {
  local budget="$1" url="$2" measured="$3" rounded
  # Defence in depth, and not redundant: `printf '%.0f' ""` prints `0` and exits **0** — there
  # is no status to check — so anything that reaches here unmeasured would be certified as the
  # fastest page in the product. A measurement that is not a number is not a fast page; it is
  # no page at all.
  case "$measured" in
    '' | *[!0-9.]* | *.*.* | .)
      echo "FAIL: ${url} — no usable LCP measurement (got '${measured}')." >&2
      echo "      A run that produced no number measured nothing, and a gate that reads that" >&2
      echo "      as zero can never fail again (FR-025, SC-006)." >&2
      return 1
      ;;
  esac
  rounded="$(printf '%.0f' "$measured")"
  if [ "$rounded" -le "$budget" ]; then
    printf '── PASS  %-16s LCP %sms (budget %sms)\n' "$url" "$rounded" "$budget"
    return 0
  fi
  echo "FAIL: ${url} — LCP ${rounded}ms exceeds the ${budget}ms budget on the 4G profile (FR-025, SC-006)." >&2
  return 1
}

# Three Lighthouse runs against one page; prints the median LCP in milliseconds.
measure_url() {
  local path="$1" slug run report sample samples=()
  slug="$(printf '%s' "$path" | tr -c 'a-zA-Z0-9' '_')"
  for run in $(seq 1 "$RUNS_PER_URL"); do
    report="$WORKDIR/lhr${slug}-${run}.json"
    if ! npx --yes lighthouse@12 "${BASE}${path}" \
         --output=json --output-path="$report" \
         --only-categories=performance --quiet \
         --chrome-flags='--headless=new --no-sandbox --disable-dev-shm-usage' \
         "${THROTTLING[@]}" > "$WORKDIR/lighthouse.log" 2>&1; then
      echo "FAIL: Lighthouse could not measure ${BASE}${path} (run ${run}/${RUNS_PER_URL})." >&2
      tail -20 "$WORKDIR/lighthouse.log" >&2
      return 1
    fi
    # A SCALAR assignment with an explicit `|| return 1`, never `samples+=("$(...)")`.
    # Measured on this tree (bash 5.3.15): appending a failed command substitution to an array
    # does NOT trip `set -e`, so all three runs proceeded, `samples` became three empty
    # strings, the median was empty, and `printf '%.0f' ""` printed 0 and exited **0** — the
    # gate reported `── PASS  /  LCP 0ms` and returned 0 with nothing measured. That is the
    # exact failure the comment above `lcp_ms_from_report` says it exists to prevent: the
    # function refused correctly and the caller threw the refusal away.
    sample="$(lcp_ms_from_report "$report")" || return 1
    samples+=("$sample")
  done
  median_of_three "${samples[@]}"
}

# ── preconditions ─────────────────────────────────────────────────────────────────────────

# A real 200, carrying the Host header tenancy resolves from. Anything else — a connection
# refused, a 404 from an unseeded database, a 500 — means there is nothing here worth measuring,
# and the give-up message carries the last status so the next person debugs the seed and not
# Lighthouse.
wait_for_http_200() {
  local url="$1" attempts="${LCP_WAIT_ATTEMPTS:-60}" interval="${LCP_WAIT_INTERVAL_S:-2}"
  local code="" attempt
  for attempt in $(seq 1 "$attempts"); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: ${LCP_HOST}" "$url" || true)"
    if [ "$code" = "200" ]; then
      echo "── ready: $url answered 200 as Host: ${LCP_HOST} (attempt ${attempt}/${attempts})"
      return 0
    fi
    sleep "$interval"
  done
  echo "FAIL: $url never answered 200 as Host: ${LCP_HOST} after ${attempts} attempts (last status: ${code:-none})." >&2
  echo "      Nothing was measured. A 404 here usually means the seed did not run, or the test" >&2
  echo "      suite destroyed the seeded host domains — Lighthouse would have scored the error" >&2
  echo "      page at a very good LCP and passed this gate." >&2
  return 1
}

start_server() {
  # `set -m` puts the server in its own process group, so cleanup can kill the whole tree.
  # Killing the `pnpm` pid alone orphans `next start`, which then holds the port for the next
  # run of this script.
  set -m
  pnpm --filter @fablab/web start > "$WORKDIR/server.log" 2>&1 &
  SERVER_PID=$!
  set +m
  echo "── production server starting on port ${PORT} (pid ${SERVER_PID})"
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill -- "-${SERVER_PID}" 2>/dev/null || kill "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${WORKDIR:-}" 2>/dev/null || true
}

main() {
  case "${1:-}" in
    -h|--help) usage; return 0 ;;
    '') ;;
    *) usage >&2; return 64 ;;
  esac

  cd "$ROOT"
  WORKDIR="$(mktemp -d)"
  trap cleanup EXIT

  echo "── applying migrations"
  # `--force-accept-warning`, and it is not a shortcut. `payload migrate` asks
  # "you've run Payload in dev mode … data loss will occur. Would you like to proceed? (y/N)"
  # whenever the target database carries schema that was pushed rather than migrated — which is
  # any database a previous run of this gate left half-built. On a CI runner there is nobody to
  # answer, so the gate hangs on an invisible prompt until `timeout-minutes: 45` kills the job,
  # and the failure arrives with no error text at all: exactly the shape tasks.md § "Read before
  # starting" item 5 records for `migrate:create`. Measured here on 2026-09-08, on a scratch
  # database left dirty by an interrupted run.
  #
  # Accepting the warning is correct for THIS caller and only this one: the gate migrates a
  # database it seeds from empty in the next step, so there is no data any answer could protect.
  pnpm --filter @fablab/web migrate --force-accept-warning
  echo "── seeding published content in a resolvable organization"
  pnpm --filter @fablab/web seed
  echo "── building"
  pnpm --filter @fablab/web build

  start_server
  wait_for_http_200 "http://127.0.0.1:${PORT}/"

  local page median failures=()
  for page in "${PAGES[@]}"; do
    median="$(measure_url "$page")"
    assert_lcp_at_most "$BUDGET_MS" "$page" "$median" || failures+=("$page")
  done

  if [ "${#failures[@]}" -gt 0 ]; then
    echo "" >&2
    echo "FAIL: ${#failures[@]} page(s) over the ${BUDGET_MS}ms LCP budget: ${failures[*]}" >&2
    echo "      Each is asserted on its own; a fast page never redeems a slow one (SC-006)." >&2
    return 1
  fi

  echo "── PASS: every public page is within the ${BUDGET_MS}ms LCP budget on the 4G profile."
}

# Executed: run the gate. Sourced: hand over the functions above, which is how the gate's own
# tests exercise the median, the report reader and the per-URL assertion without a browser.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
