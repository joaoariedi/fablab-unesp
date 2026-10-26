#!/usr/bin/env bash
#
# Is this pull request docs-only? (feature 009, FR-001, FR-002, FR-007, FR-008, FR-012)
#
# A docs-only pull request still has to report every required context — the job names in
# `.github/workflows/ci.yml` are the branch-protection contexts — so the code-stage jobs cannot
# be skipped. They start, run checkout and this script, and skip their remaining steps when it
# says the change is docs. A skipped job, or one that never reports, would either pass silently
# or block every merge; a skipped STEP does neither.
#
# ── The rule ──────────────────────────────────────────────────────────────────────────────
#
# A change is docs iff every changed path ends in `.md` AND none of them is read by a test or a
# script. "Read" means quoted: the full repo-relative path, or the basename alone, between single
# or double quotes in a tracked file that is not itself Markdown. Those are the two shapes every
# literal read in the test suite takes — a full path string, or a `join()` segment. Quoting is
# what keeps prose out: an unquoted mention in a code comment is not a read.
#
# The classifier's own test is excluded from that search: its fixtures quote Markdown paths on
# purpose. For the same reason THIS header, ci.yml and the wiring test describe the rule in words
# and never quote a Markdown path or basename — one quoted there would make that file code for
# every pull request, and the feature would narrow without anyone noticing.
#
# Not detected: a Markdown path built from variables, or a directory walk. None exists today; the
# whole-tree scanner is run on the docs-only path instead (FR-014, pinned by the wiring test),
# and the full `push` run on dev/main re-measures the merged tree as the backstop.
#
# ── The contract ──────────────────────────────────────────────────────────────────────────
#
#   classify   paths on stdin, one per line  → stdout: docs | code
#   github     the pull request's own diff    → stdout: the verdict and the changed files;
#              appends docs_only=true|false to $GITHUB_OUTPUT when it is set
#
#   exit 0 on every verdict — including a failure, which is the verdict `code`
#   exit 64 bad usage
#
# Every doubt is `code`: an empty list, a git error, a push event, a base that does not resolve,
# no repository at all. A non-zero exit would fail the job red, which is safe but blocks a code
# pull request for a classifier bug; the workflow's `continue-on-error` is the second net.
# `docs_only` is written as the very last action, so no crash can leave `true` behind — a crash
# leaves it unset, and every consumer reads unset as "run".
#
#   CHANGE_SCOPE_BASE   the base revision (default HEAD^1: the base-branch parent of the
#                       pull_request merge ref, which is why gated checkouts use fetch-depth 2)
#
# ── Which tree ────────────────────────────────────────────────────────────────────────────
#
# The repository of the CURRENT folder (`git rev-parse --show-toplevel`), not of this script.
# Every other script here derives its root from its own location; this one deliberately does
# not, because a script-relative root makes the github-mode test unreachable — it would diff this
# repository instead of the test's fixture repository. CI runs every step from the checkout root.
set -euo pipefail

SELF_TEST='apps/web/tests/ci-change-scope.test.ts' # its fixtures quote docs paths on purpose

usage() {
  cat >&2 <<'USAGE'
usage: scripts/ci-change-scope.sh classify < paths
       scripts/ci-change-scope.sh github

  classify   read changed paths from stdin, print docs or code
  github     classify the pull_request diff HEAD^1..HEAD (CHANGE_SCOPE_BASE overrides the
             base), print the verdict and files, append docs_only= to $GITHUB_OUTPUT

exit: 0 on every verdict (any failure is the verdict code) | 64 usage
USAGE
}

enter_repo() {
  local top
  top="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$top" ] && cd "$top"
}

# $1 = a repo-relative Markdown path. git grep exits 0 on a match, 1 on none and >= 2 on an
# error; only 1 means "not read", so an error counts as a read and fails to code. Every pattern
# goes through -e, so a path starting with - is never an option; -F makes it literal.
is_test_read() {
  local base="${1##*/}" rc=0
  git grep -qF -e "'$1'" -e "\"$1\"" -e "'$base'" -e "\"$base\"" \
    -- ':!*.md' ":!$SELF_TEST" || rc=$?
  [ "$rc" -ne 1 ]
}

classify() {
  local path seen=0
  enter_repo || { echo code; return; } # no repository: no evidence of docs
  # `|| [ -n "$path" ]`: read fails on a last line with no newline, which would drop that path.
  while IFS= read -r path || [ -n "$path" ]; do
    [ -n "$path" ] || continue
    seen=1
    if [[ "$path" != *.md ]] || is_test_read "$path"; then
      echo code
      return
    fi
  done
  if [ "$seen" = 1 ]; then echo docs; else echo code; fi # an empty list is not evidence of docs
}

# core.quotePath=false lists a non-ASCII name raw, so an accented Markdown name still ends in
# .md; a name holding a double quote, a backslash or a control character stays C-quoted, ends in
# a quote, and falls to code — the safe direction.
github() {
  local verdict=code files=''
  if [ "${GITHUB_EVENT_NAME-}" = pull_request ] && enter_repo &&
    files="$(git -c core.quotePath=false diff --name-only --no-renames \
      "${CHANGE_SCOPE_BASE:-HEAD^1}" HEAD 2>/dev/null)"; then
    verdict="$(classify <<<"$files")"
  fi
  echo "change scope: $verdict"
  printf '%s\n' "$files" | sed '/^$/d;s/^/  /'
  if [ -n "${GITHUB_OUTPUT-}" ]; then # an if, not &&: an unset variable must still exit 0
    echo "docs_only=$([ "$verdict" = docs ] && echo true || echo false)" >>"$GITHUB_OUTPUT"
  fi
}

case "${1-}" in
  classify) classify ;;
  github) github ;;
  *)
    usage
    exit 64
    ;;
esac
