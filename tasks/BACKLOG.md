# BACKLOG

## FAB-5 — Check the dependency upgrade against Postgres

Split from FAB-1. The FAB-4 worker's sandbox cannot reach the Docker socket, so the
database-backed checks never ran on the upgraded tree: the `Migration drift` check (and a
`migrate:create` migration only if it reports drift), the DB-backed integration tests, and
the isolation harness with its can-fail matrix.

Starts after FAB-4 merges. Done when all three pass on `dev` with the upgrade in, in CI or
on a machine with Docker.

## 🛡 FAB-6 — Clear braces GHSA-vfj7-8cjw-p6xm once a fix ships

Split from FAB-1. braces 3.0.3 (high, stack-exhaustion DoS) has no patched release. It is
held by `@payloadcms/next`'s exact `sass@1.77.4` pin (through `chokidar@3`) and by
`@payloadcms/plugin-cloud-storage → findup-sync → micromatch`. Both chains expand
build-time globs only; no request input reaches them.

Starts when braces, sass's chain or Payload ships a release that removes it. Done when
`pnpm audit --audit-level high` exits 0 with no exception and no ignore list.
