#!/usr/bin/env bash
#
# Proves the LCP budget gate CAN FAIL (SC-006, SC-012, T016).
#
# `scripts/lcp-budget.sh` has only ever been observed green, and a performance gate that has
# only ever been green is evidence of nothing. Every way it can stop measuring is invisible
# from a passing badge: a build that serves an error page, a Lighthouse run whose report
# carries no LCP audit, a page list that quietly went empty. So this plants a deliberately
# oversized hero on the Home, runs the real gate against the mutated tree, and requires it to
# go red **naming the URL and the measured value**.
#
# ── Why exit code alone is not accepted ───────────────────────────────────────────────────
#
# This is the whole discipline, and it is the lesson `isolation-mutation.sh` already paid for:
# there, a mutation that produced a SYNTAX error made the harness fail to compile, which still
# exits non-zero and would have been read as a successful proof. The budget has more ways to
# do the same — a missing seed makes the readiness probe give up, a failed build never starts a
# server, a dead database exits before Lighthouse runs. Each exits non-zero having measured
# nothing at all. So the verdict is: the budget must exit non-zero AND print a per-page failure
# naming the mutated URL AND carry a measured millisecond value that really exceeds the budget.
# The number is parsed and compared, not merely matched, because "LCP 100ms exceeds the 2500ms
# budget" is output no working gate can produce and no proof should accept.
#
# ── Why the Home page is REPLACED rather than patched ─────────────────────────────────────
#
# `isolation-mutation.sh` patches marked expressions with `perl`, and needs a test of its own
# (tests/isolation-mutation-layers.test.ts) precisely because a pattern whose target moved
# mutates nothing and reports success on a tree it never touched. The Home is rewritten twice
# in this feature (T025 plants the real hero, T026 builds Home v1), so a pattern-based patch
# here would be drift waiting to happen. A wholesale replacement from a byte-for-byte backup
# cannot drift: there is no pattern to stop matching, and the restore is a copy back.
#
# ── Why the asset is generated rather than committed ──────────────────────────────────────
#
# A 12 MB PNG in the repository is 12 MB in every clone, forever, to be used by one script. It
# is random noise at compression level 0 — incompressible on purpose, because a hero that gzips
# down on the wire is not the oversized hero this is trying to plant.
#
# Usage:  scripts/lcp-mutation.sh
#         PORT=3100 scripts/lcp-mutation.sh
set -euo pipefail

# The measured values are compared as integers; a locale whose decimal separator is a comma
# (pt_BR is the likely one here) turns that parsing into a silent refusal. Same reason as the
# budget script's own export.
export LC_ALL=C

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"
HOME_PAGE="$WEB/app/(frontend)/page.tsx"

# The URL the mutation is planted on. The gate asserts every public page independently, so the
# proof must name the one page it actually made slow — a red /projetos would prove nothing
# about a hero planted on the Home.
MUTATED_URL="/"

HERO_FILE="lcp-mutation-hero.png"
HERO="$WEB/public/$HERO_FILE"

# ── The hero has to be too slow to pass AND fast enough to be measured ──────────────────────
#
# The plan sketched a 12 MB hero (2000 x 2000 x 3 bytes of incompressible noise, measured at
# 12,021,354 bytes) and that number is unusable, for a reason no test could show:
#
#   `scripts/lcp-budget.sh` throttles at 188,743 B/s, so 12 MB needs **63.7 seconds** on the
#   wire. Lighthouse gives up at `maxWaitForLoad` = 45,000 ms. An image LCP entry is emitted on
#   load-and-paint, so an asset that never finishes loading is never an LCP candidate: the
#   largest element that *does* paint is the `<h1>` beside it, at a perfectly fast LCP. The
#   budget then reports `── PASS  /` and exits 0, and this script's own verdict prints
#   "the LCP budget PASSED with a deliberately oversized hero" — falsely accusing a gate that
#   was measuring correctly, and leaving `Performance budget can fail` permanently red.
#
# So there are TWO bounds, and both are derived from the same two constants the budget script
# declares (`LCP_THROTTLE_BYTES_PER_S`, `LCP_MAX_WAIT_MS`) rather than retyped as magic sizes.
# `tests/lcp-mutation.test.ts` holds the copies together.
THROTTLE_BYTES_PER_S=188743
BUDGET_LOAD_CAP_MS=45000
LCP_BUDGET_MS_DEFAULT=2500

# FLOOR — the hero must take at least four times the budget to arrive. An asset a 4G connection
# can deliver inside 2.5s mutates nothing, and the gate would stay green for the right reason.
MIN_HERO_BYTES=$((THROTTLE_BYTES_PER_S * LCP_BUDGET_MS_DEFAULT * 4 / 1000))

# CEILING — and it must arrive inside 60% of Lighthouse's load cap. Not 100%: the transfer is
# not the only thing in the window (navigation, the document, the CPU slowdown multiplier), and
# a hero that only just fits is one that stops fitting on a slower runner.
MAX_HERO_BYTES=$((THROTTLE_BYTES_PER_S * BUDGET_LOAD_CAP_MS * 6 / 10 / 1000))

# Sized to land in the middle of that window: 1080 x 1080 x 3 bytes of noise ≈ 3.5 MB, which is
# 18.6s on the wire — 7.4x the budget it must blow, and 41% of the cap it must fit inside.
HERO_EDGE=1080

usage() {
  cat <<'USAGE'
usage: scripts/lcp-mutation.sh

Plants a deliberately oversized hero on the Home, runs scripts/lcp-budget.sh against the
mutated tree, and requires it to fail NAMING the URL and the measured value (SC-006, SC-012).

Exit code alone is not accepted: a missing seed, a failed build and a dead server all exit
non-zero without measuring anything.

The working tree is restored on exit, on every path.
USAGE
}

# ── the verdict ───────────────────────────────────────────────────────────────────────────

is_positive_integer() {
  case "${1:-}" in
    '' | *[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# The budget's per-page failure line for one URL, or nothing.
#
# `index($0, ...) == 1` rather than a regex: the URL is a path full of `/`, and the summary
# line ("FAIL: 1 page(s) over the ...") must not be mistaken for a per-page one. awk rather
# than `grep | head`, because under `set -o pipefail` a reader that exits first leaves the
# writer with SIGPIPE and fails the script after it has already decided — the exact
# intermittent defect recorded in isolation-mutation.sh.
budget_failure_line() {
  awk -v url="$1" 'index($0, "FAIL: " url " ") == 1 && /LCP [0-9]+ms/ && !seen++' "$2"
}

# The proof, as one assertion: non-zero status, a line naming the mutated URL, and a measured
# value that really exceeds the budget it is compared against.
assert_budget_failed_on_hero() {
  local url="$1" status="$2" out="$3" line measured budget

  if [ "$status" -eq 0 ]; then
    echo "FAIL: the LCP budget PASSED with a deliberately oversized hero on ${url}." >&2
    echo "      It is not measuring what it claims to measure — a green run of that gate is" >&2
    echo "      not evidence the pages are fast (SC-006)." >&2
    return 1
  fi

  line="$(budget_failure_line "$url" "$out")"
  if [ -z "$line" ]; then
    echo "FAIL: the budget exited ${status}, but nothing in its output names ${url} with a" >&2
    echo "      measured LCP. Exit code alone is not accepted: a missing seed, a failed build" >&2
    echo "      and a server that never answered all exit non-zero having measured nothing." >&2
    return 1
  fi

  measured="$(printf '%s' "$line" | sed -E 's/.*LCP ([0-9]+)ms.*/\1/')"
  budget="$(printf '%s' "$line" | sed -E 's/.*exceeds the ([0-9]+)ms.*/\1/')"
  if ! is_positive_integer "$measured" || ! is_positive_integer "$budget"; then
    echo "FAIL: the budget named ${url} but carried no readable measurement:" >&2
    echo "      ${line}" >&2
    echo "      A failure without the number cannot be believed, and exit code alone is not" >&2
    echo "      accepted." >&2
    return 1
  fi

  if [ "$measured" -le "$budget" ]; then
    echo "FAIL: the budget reported ${measured}ms against a ${budget}ms budget on ${url} — that" >&2
    echo "      is not over budget. The failure and the numbers it prints disagree, so the" >&2
    echo "      measurement is not what made it red." >&2
    return 1
  fi

  echo "── PASS: the budget went red on ${url} at ${measured}ms against its ${budget}ms budget."
  echo "   ${line}"
  return 0
}

# ── the mutation ──────────────────────────────────────────────────────────────────────────

plant_oversized_hero() {
  local bytes
  mkdir -p "$WEB/public"
  # `sharp` is a declared dependency of @fablab/web, so the generator runs from there. Random
  # noise at compressionLevel 0: PNG cannot squeeze it, which is the entire point.
  (cd "$WEB" && node -e '
    const sharp = require("sharp")
    const { randomBytes } = require("node:crypto")
    const target = process.argv[1]
    const edge = Number(process.argv[2])
    sharp(randomBytes(edge * edge * 3), { raw: { width: edge, height: edge, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toFile(target)
      .catch((error) => {
        console.error(`could not generate the oversized hero at ${target}: ${error}`)
        process.exit(1)
      })
  ' "$HERO" "$HERO_EDGE")

  bytes="$(wc -c < "$HERO" | tr -d ' ')"
  if [ "$bytes" -lt "$MIN_HERO_BYTES" ]; then
    echo "FAIL: the planted hero is ${bytes} bytes, under the ${MIN_HERO_BYTES}-byte floor." >&2
    echo "      An asset a 4G connection can deliver inside the budget mutates nothing." >&2
    return 1
  fi
  if [ "$bytes" -gt "$MAX_HERO_BYTES" ]; then
    echo "FAIL: the planted hero is ${bytes} bytes, over the ${MAX_HERO_BYTES}-byte ceiling." >&2
    echo "      At ${THROTTLE_BYTES_PER_S} B/s that is $((bytes / THROTTLE_BYTES_PER_S))s, and" >&2
    echo "      Lighthouse abandons the load at $((BUDGET_LOAD_CAP_MS / 1000))s. An image that" >&2
    echo "      never finishes loading never becomes an LCP candidate, so the budget would" >&2
    echo "      measure the <h1> beside it, PASS, and this proof would blame a working gate." >&2
    return 1
  fi
  echo "── planted a ${bytes}-byte hero at apps/web/public/${HERO_FILE}" \
    "($((bytes / THROTTLE_BYTES_PER_S))s on the wire; budget $((LCP_BUDGET_MS_DEFAULT / 1000))s, cap $((BUDGET_LOAD_CAP_MS / 1000))s)"
}

# The Home, replaced by one that renders the planted hero above the fold. A plain `<img>` and
# not `next/image`: the optimizer would resize and re-encode the asset, and the bytes that
# never reach the browser cannot slow it down.
mutate_home() {
  cat > "$HOME_PAGE" <<TSX
// MUTATED by scripts/lcp-mutation.sh — restored when that script exits. If you are reading
// this in a commit, the script was killed before its trap ran: restore the file from git.
export default function HomePage() {
  return (
    <main>
      <img
        src="/${HERO_FILE}"
        alt="deliberately oversized hero planted by scripts/lcp-mutation.sh"
        width={${HERO_EDGE}}
        height={${HERO_EDGE}}
        style={{ width: '100%', height: 'auto' }}
      />
      <h1>Fab Lab CITe Bauru</h1>
    </main>
  )
}
TSX
  grep -q 'MUTATED by scripts/lcp-mutation.sh' "$HOME_PAGE" || {
    echo "FAIL: the Home page was not mutated; the gate would have measured the real page." >&2
    return 1
  }
  echo "── mutated apps/web/app/(frontend)/page.tsx to render it"
}

# Restores from a byte-for-byte copy, and removes the generated asset. Runs on every exit path
# — the success one, the refusal, and a failure inside the mutation itself.
restore() {
  if [ -n "${BACKUP:-}" ] && [ -f "$BACKUP/page.tsx" ]; then
    cp "$BACKUP/page.tsx" "$HOME_PAGE"
  fi
  rm -f "$HERO"
  rm -rf "${BACKUP:-}" "${WORKDIR:-}"
}

main() {
  case "${1:-}" in
    -h | --help)
      usage
      return 0
      ;;
    '') ;;
    *)
      usage >&2
      return 64
      ;;
  esac

  cd "$ROOT"

  # ── One run at a time, because the mutation is not private to it ──────────────────────────
  #
  # This script rewrites a TRACKED source file in the shared working tree. Two runs overlapping
  # is not a rare race: it happened during this task's own review, where a concurrent run left
  # the tree carrying a half-mutated Home and corrupted two measurements. The damage is worse
  # than a wrong number — the loser's `restore` copies ITS backup over the winner's mutation,
  # so a run can be silently measuring the real Home while reporting on a planted hero.
  #
  # `flock` is util-linux and present on every Linux runner; where it is missing the marker
  # check below still catches the overlap that has already begun, which is the case that
  # actually corrupts a tree.
  if command -v flock >/dev/null 2>&1; then
    # Read-only on purpose: the descriptor is a lock handle, not a way in to the file.
    exec 9<"$HOME_PAGE"
    if ! flock -n 9; then
      echo "FAIL: another scripts/lcp-mutation.sh run holds the Home page." >&2
      echo "      Two runs share one working tree, so the second would mutate an already" >&2
      echo "      mutated file and then restore its own backup over the first one's work." >&2
      return 1
    fi
  fi

  if grep -q 'MUTATED by scripts/lcp-mutation.sh' "$HOME_PAGE"; then
    echo "FAIL: ${HOME_PAGE} already carries the mutation marker." >&2
    echo "      Either a run is in flight, or one was killed before its trap restored the" >&2
    echo "      file. Backing it up now would make the mutation permanent — restore it from" >&2
    echo "      git first: git checkout -- 'apps/web/app/(frontend)/page.tsx'" >&2
    return 1
  fi

  BACKUP="$(mktemp -d)"
  WORKDIR="$(mktemp -d)"
  cp "$HOME_PAGE" "$BACKUP/page.tsx"
  trap restore EXIT

  plant_oversized_hero
  mutate_home

  echo "── running scripts/lcp-budget.sh against the mutated tree"
  local out="$WORKDIR/budget.log" status=0
  # `tee` so a twenty-minute gate is not silent, and `set -o pipefail` so the pipeline carries
  # the gate's status rather than tee's.
  if bash "$ROOT/scripts/lcp-budget.sh" 2>&1 | tee "$out"; then
    status=0
  else
    status=$?
  fi
  echo "── budget exit status: $status"

  if ! assert_budget_failed_on_hero "$MUTATED_URL" "$status" "$out"; then
    echo "── the budget's last 30 lines:" >&2
    tail -30 "$out" >&2
    return 1
  fi
}

# Executed: run the proof. Sourced: hand over the verdict above, which is how its own tests
# exercise every refusal without building or measuring anything.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
