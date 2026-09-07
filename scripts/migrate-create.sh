#!/usr/bin/env bash
# Generate a Payload migration without hanging on Drizzle's interactive prompt.
#
# WHY THIS EXISTS. When a new table could plausibly be a *rename* of one being dropped,
# drizzle-kit asks which it is — a raw-TTY select, not a line read. Piped input does not reach
# it. In a non-TTY the process waits forever, and `pnpm --filter @fablab/web migrate:create`
# looks like a hang with no output to explain it.
#
# The same prompt is reached by `push: true` at CONFIG LOAD, which is far worse: every test file
# that boots Payload then dies with `Hook timed out in 120000ms` and no error naming a cause.
# Measured on 2026-09-07, when `projeto.galeria`/`arquivos` became relationships: twelve suites
# reported "skipped" and the reason was a question nobody could see.
#
# This drives the prompt over a real pty and answers with the highlighted default — "create
# table", which is correct whenever the new table is genuinely new. If a run needs a RENAME
# answered instead, run it by hand in a terminal; do not teach this script to guess.
#
#   ./scripts/migrate-create.sh <migration_name>
#
# After generating, ALWAYS open the file and confirm it contains the columns you expect: dev
# runs with `push: true`, so `migrate:create` diffs against a database that has already been
# pushed to and can legitimately produce an empty migration.
set -euo pipefail

NAME="${1:-}"
if [ -z "$NAME" ]; then
  echo "usage: $0 <migration_name>" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/apps/web"
exec python3 - "$NAME" <<'PY'
import os, pty, select, sys, time

name = sys.argv[1]
pid, fd = pty.fork()
if pid == 0:
    os.execvp("pnpm", ["pnpm", "exec", "payload", "migrate:create", name])
    os._exit(1)

buf, answered, start = b"", 0, time.time()
while time.time() - start < 600:
    ready, _, _ = select.select([fd], [], [], 1.0)
    if not ready:
        if os.waitpid(pid, os.WNOHANG)[0] != 0:
            break
        continue
    try:
        chunk = os.read(fd, 4096)
    except OSError:
        break
    if not chunk:
        break
    buf += chunk
    sys.stdout.write(chunk.decode("utf8", "replace"))
    sys.stdout.flush()
    # Answer every "created or renamed" select with Enter, i.e. the highlighted "create table".
    if b"created or renamed" in buf and answered < 20:
        time.sleep(0.4)
        os.write(fd, b"\r")
        answered += 1
        buf = b""

print(f"\n[migrate-create] answered {answered} rename prompt(s) with 'create table'")
PY
