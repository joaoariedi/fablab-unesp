#!/usr/bin/env bash
#
# Is each CI gate actually merge-blocking? (T030, T018, SC-012)
#
# `.github/workflows/ci.yml` says it in its own header — "Job NAMES are the required-status-
# check contexts on `dev` and `main`" — and no file in this tree can check it. Branch
# protection lives on GitHub. A job that runs on every pull request and is absent from
# `required_status_checks.contexts` reports its red and is merged past: it is a notification,
# not a gate, and nothing local can tell the two apart.
#
# So this script asks GitHub, and compares the answer to `.github/required-checks.json` — the
# recorded result of the same question, on the date in that file. The record is what makes the
# claim checkable offline (apps/web/tests/required-checks.test.ts pins it against ci.yml and
# against tasks.md § Outstanding); this script is what stops the record becoming a lie.
#
# ── The exit contract ─────────────────────────────────────────────────────────────────────
#
#   0  live protection matches the record
#   1  it does not, or a required context names no job in ci.yml
#   2  the check could not run (no gh, not authenticated, no admin rights on protection)
#  64  bad usage
#
# 2 is separate from 1 on purpose, and it is the reason this script is not a `pnpm test` case.
# Reading branch protection needs admin, which a CI job's GITHUB_TOKEN does not have, and a
# gate that cannot run must never be able to look like one that ran and passed — the failure
# `scripts/check-colour-tokens.sh` shipped and this repo has already paid for once.
#
# ── What it does NOT do ───────────────────────────────────────────────────────────────────
#
# It does not fail on gates that are merely unrequired. Four are, today, and closing that is
# T018: a repository-admin action on GitHub that no agent can perform. Failing here would make
# the only available state red, and a permanently red check is one somebody deletes. The gap is
# printed, loudly and by name, and it is PINNED by the test — a fifth gate joining it turns the
# suite red, which is the failure that let the first two sit unnoticed for a whole feature.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SNAPSHOT='.github/required-checks.json'
WORKFLOW='.github/workflows/ci.yml'
BRANCHES=(main dev)

usage() {
  cat >&2 <<USAGE
usage: scripts/required-checks.sh [--write]

Verifies that the branch protection recorded in $SNAPSHOT is still what GitHub reports, by
querying the live protection API for each protected branch:

  gh api repos/<repo>/branches/<branch>/protection --jq '.required_status_checks.contexts'

Branches checked: ${BRANCHES[*]}  (main is the release branch, dev the integration branch;
a context required on only one of them is not a gate on the other.)

  --write   re-record the live answer into $SNAPSHOT instead of comparing against it.
            Use it after branch protection is deliberately changed — e.g. when T018 adds
            the missing contexts — and commit the result with the change that caused it.

exit: 0 recorded state confirmed | 1 drift, or a required context no job reports under
      2 the check could not run (no gh, not authenticated, no admin on protection) | 64 usage
USAGE
}

MODE='verify'
case "${1-}" in
  '') ;;
  --write) MODE='write' ;;
  *) usage; exit 64 ;;
esac

[ -f "$SNAPSHOT" ] || { echo "FAIL: $SNAPSHOT is missing; run --write to record it." >&2; exit 1; }
command -v gh >/dev/null || { echo "SKIPPED: gh is not installed, so protection cannot be read." >&2; exit 2; }
command -v jq >/dev/null || { echo "SKIPPED: jq is not installed." >&2; exit 2; }

REPO="$(jq -er '.repo' "$SNAPSHOT")"

# The contexts GitHub requires on one branch, as a sorted COMPACT JSON array. Sorted because
# protection returns them in insertion order and a reordering is not a change; compact because
# the comparison below is a string compare, and `gh --jq` emits one line where `jq` on a file
# pretty-prints — measured, and it reported drift between two identical lists.
live_contexts() {
  gh api "repos/$REPO/branches/$1/protection" \
     --jq '.required_status_checks.contexts | sort' 2>/dev/null | jq -c .
}

# Job names as GitHub reports them, with the one matrix job expanded — `isolation-mutation`
# interpolates ${{ matrix.layer }} into its name deliberately, so it contributes one context
# per layer and a comparison that skips the expansion invents a context nobody can require.
ci_gate_names() {
  local layers name
  layers="$(sed -nE 's/^ *layer: *\[(.*)\] *$/\1/p' "$WORKFLOW" | tr -d ' ' | tr ',' '\n')"
  while IFS= read -r name; do
    if [[ "$name" == *'${{ matrix.layer }}'* ]]; then
      while IFS= read -r layer; do
        [ -n "$layer" ] && echo "${name//\$\{\{ matrix.layer \}\}/$layer}"
      done <<< "$layers"
    else
      echo "$name"
    fi
  done < <(sed -nE "s/^ {4}name: *['\"]?(.*[^'\"])['\"]? *$/\1/p" "$WORKFLOW")
}

if [ "$MODE" = 'write' ]; then
  recorded='{}'
  for branch in "${BRANCHES[@]}"; do
    contexts="$(live_contexts "$branch")" || { echo "FAIL: cannot read protection for $branch." >&2; exit 2; }
    recorded="$(jq --arg b "$branch" --argjson c "$contexts" '.[$b] = $c' <<< "$recorded")"
  done
  jq --argjson branches "$recorded" --arg at "$(date -u +%F)" \
     '.branches = $branches | .measuredAt = $at' "$SNAPSHOT" > "$SNAPSHOT.tmp"
  mv "$SNAPSHOT.tmp" "$SNAPSHOT"
  echo "── recorded live protection for ${BRANCHES[*]} into $SNAPSHOT"
  exit 0
fi

status=0
gates="$(ci_gate_names)"

for branch in "${BRANCHES[@]}"; do
  if ! live="$(live_contexts "$branch")" || [ -z "$live" ]; then
    echo "SKIPPED: could not read protection for $branch on $REPO." >&2
    echo "         Reading required_status_checks needs admin rights; gh reported nothing." >&2
    exit 2
  fi
  want="$(jq -cer --arg b "$branch" '.branches[$b] | sort' "$SNAPSHOT")"
  if [ "$live" != "$want" ]; then
    echo "FAIL: $branch protection has drifted from $SNAPSHOT." >&2
    echo "      recorded: $(jq -c . <<< "$want")" >&2
    echo "      live:     $(jq -c . <<< "$live")" >&2
    echo "      Re-record with --write and update .specify/specs/003-paginas-publicas/tasks.md" >&2
    echo "      § Outstanding, whose 'Missing context' table is checked against this file." >&2
    status=1
    continue
  fi
  while IFS= read -r context; do
    if ! grep -Fxq "$context" <<< "$gates"; then
      echo "FAIL: $branch requires the status check \"$context\" and no job in $WORKFLOW" >&2
      echo "      reports under that name. A required context that never appears blocks" >&2
      echo "      every merge on $branch, forever." >&2
      status=1
    fi
  done < <(jq -er '.[]' <<< "$live")
  echo "── $branch: $(jq -r 'length' <<< "$live") required contexts, matching $SNAPSHOT"
done

# The advisory half. Not a failure — see the header — but never silent.
required="$(jq -er '.branches.dev | .[]' "$SNAPSHOT")"
advisory="$(grep -Fxv -f <(echo "$required") <<< "$gates" || true)"
if [ -n "$advisory" ]; then
  echo ""
  echo "ADVISORY (T018, SC-012): these CI jobs run on every pull request and are NOT required"
  echo "status checks, so a change that fails them can still be merged:"
  echo "$advisory" | sed 's/^/  - /'
  echo ""
  echo "Closing this needs repository-admin rights on $REPO:"
  echo "  gh api -X POST repos/$REPO/branches/<branch>/protection/required_status_checks/contexts \\"
  echo "$advisory" | sed "s/^/    -f 'contexts[]=/;s/$/' \\\\/"
  echo "  # then: scripts/required-checks.sh --write"
fi

exit "$status"
