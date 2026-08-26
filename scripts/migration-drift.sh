#!/usr/bin/env bash
#
# Migration drift gate (FR-027, SC-010, CLR-004).
#
# `docs/tech-stack.md` names Payload+Postgres migration drift as architecture risk number
# one, and its original mitigation was a ritual: push only in dev, commit what
# `migrate:create` produces. Rotating volunteers drop rituals. This converts the ritual into
# a mechanism they cannot drop.
#
# How it works: apply the committed migrations to an empty database, then ask Payload to
# generate a migration for whatever is still missing. If the committed migrations really do
# reproduce the schema the code declares, there is nothing left to generate and Payload says
# so. Anything else is drift.
#
# stdin is closed deliberately: `migrate:create` PROMPTS ("create a blank migration file?")
# and would hang a CI job forever waiting for an answer nobody is there to give.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB="$ROOT/apps/web"

# When drift IS present, `migrate:create` writes a migration AND rewrites migrations/index.ts
# to import it. On CI's throwaway checkout that does not matter; run locally it leaves the
# repo unable to build, because index.ts imports a file the developer then deletes by hand.
# Measured the hard way: `next build` failed with
# `Cannot find module './20260826_140718___drift_check'`.
cleanup() {
  rm -f "$WEB"/migrations/*__drift_check* 2>/dev/null || true
  git -C "$ROOT" checkout -- apps/web/migrations/index.ts 2>/dev/null || true
}
trap cleanup EXIT

echo "── applying committed migrations to an empty database"
(cd "$WEB" && npx payload migrate) < /dev/null

echo "── asking Payload whether anything is still missing"
OUT="$(mktemp)"
set +e
(cd "$WEB" && npx payload migrate:create __drift_check) < /dev/null > "$OUT" 2>&1
set -e

if grep -q "No schema changes detected" "$OUT"; then
  echo "── PASS: committed migrations reproduce the declared schema."
  exit 0
fi

echo "FAIL: the committed migrations do NOT reproduce the schema the code declares." >&2
echo "" >&2
echo "      Someone changed a collection and let dev-mode push apply it, without" >&2
echo "      committing the migration. Run:" >&2
echo "" >&2
echo "        pnpm --filter @fablab/web migrate:create <name>" >&2
echo "" >&2
echo "      and commit the generated file." >&2
echo "" >&2
tail -30 "$OUT" >&2
exit 1
