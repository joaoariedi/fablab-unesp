#!/bin/sh
# Creates the development bucket. Idempotent: re-running compose must not fail (US1 edge —
# "re-running the seed on an existing database is idempotent" applies to storage too).
set -eu

ALIAS=local
: "${S3_BUCKET:=fablab}"

mc alias set "$ALIAS" http://storage:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# `mc mb --ignore-existing` is the whole reason this is a script and not an inline command:
# a bare `mc mb` exits non-zero on the second `docker compose up`, which reads as a broken
# quick start to someone following the README for the first time.
mc mb --ignore-existing "$ALIAS/$S3_BUCKET"

echo "minio-init: bucket '$S3_BUCKET' ready"
