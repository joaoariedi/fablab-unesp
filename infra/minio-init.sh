#!/bin/sh
# Creates the development bucket and the quarantine prefix uploads land in. Idempotent:
# re-running compose must not fail (US1 edge — "re-running the seed on an existing database is
# idempotent" applies to storage too).
set -eu

ALIAS=local
: "${S3_BUCKET:=fablab}"
# Declared by docker-compose.yml beside S3_BUCKET: the prefix is stack configuration, not a
# magic string the upload code has to guess at.
: "${QUARANTINE_PREFIX:=quarantine}"

mc alias set "$ALIAS" http://storage:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# `mc mb --ignore-existing` is the whole reason this is a script and not an inline command:
# a bare `mc mb` exits non-zero on the second `docker compose up`, which reads as a broken
# quick start to someone following the README for the first time.
mc mb --ignore-existing "$ALIAS/$S3_BUCKET"

# FR-013: with clientUploads the browser PUTs straight to the bucket (spike S1), so an object
# exists before anything has looked at its bytes. Unverified objects land under this prefix
# and only a passing signature check moves them out (plan § Sketch 4). The prefix is created
# up front so the presign path never writes into a location nobody has reasoned about.
#
# `mc mb` on a bucket/prefix path creates the prefix marker — measured against
# minio/mc:latest, which then lists it as `quarantine/`.
mc mb --ignore-existing "$ALIAS/$S3_BUCKET/$QUARANTINE_PREFIX"

# SC-008: verify, do not merely set. Measured against minio/mc:latest on 2026-09-06:
# `mc anonymous set none <bucket>/<prefix>` does NOT remove a bucket-root grant — with
# `download` set on `local/fablab`, a `set none` on the prefix still reported `download`.
# `mc anonymous get` reports the EFFECTIVE permission on the prefix, so it is the only one of
# the two that can notice the leak. A quarantine anyone can fetch from is not a quarantine.
#
# Fail closed: only `private` (nothing granted) and `custom` (a grant that covers some other
# prefix — what the served prefix will look like from here) are accepted. Anything else,
# including output this cannot parse, stops the stack rather than reporting it ready.
#
# Parsed with shell expansion and `tr` because the minio/mc image ships **no sed, awk or
# grep** — measured, after the first version of this check died with `sed: command not found`
# and exit 127, which docker compose reports as a failed init rather than as a leak.
policy=$(mc anonymous get --json "$ALIAS/$S3_BUCKET/$QUARANTINE_PREFIX" | tr -d ' \t')

case "$policy" in
  *'"permission":"'*)
    permission=${policy#*'"permission":"'}
    permission=${permission%%'"'*}
    ;;
  *) permission='' ;;
esac

case "$permission" in
  private | custom) ;;
  *)
    echo "minio-init: REFUSING to report ready — anonymous access to" \
      "'$S3_BUCKET/$QUARANTINE_PREFIX/' is '${permission:-unreadable}', expected private." \
      "Unverified uploads would be fetchable by URL the moment they land (FR-013, SC-008)." >&2
    exit 1
    ;;
esac

echo "minio-init: bucket '$S3_BUCKET' ready, '$QUARANTINE_PREFIX/' not publicly served"
