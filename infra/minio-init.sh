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
# Also declared by docker-compose.yml: how long an object may sit unclaimed in quarantine
# before the bucket reaps it (FR-019).
: "${QUARANTINE_EXPIRY_DAYS:=7}"

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

# FR-019: the orphan reaper. With clientUploads a presigned PUT can succeed while the request
# that would have recorded it never arrives, leaving an object under "$QUARANTINE_PREFIX/" that
# no database row points at — nothing in the application will ever look at it again.
# `tech-stack.md` § Storage names disk exhaustion as failure number one, so the lifetime of an
# unclaimed object belongs to the bucket itself, not to a cleanup job somebody must remember.
#
# `mc ilm rule import` and deliberately NOT `mc ilm rule add`: measured against minio/mc:latest
# on 2026-09-06, `rule add` mints a fresh rule ID on every invocation — two runs left two
# identical rules (IDs daep5oas7nf006brcsm0 and daep5oas7nf008hfcnjg, both listed by
# `ilm rule ls`). That is one duplicate per `docker compose up`, which would undo the
# re-runnability `mc mb --ignore-existing` buys above. `import` replaces the whole lifecycle
# document, so the second run is a no-op on the stored state.
#
# Replacing the whole document is also the caveat worth stating: a rule this script does not
# write is dropped. The bucket's lifecycle is owned here, in one place, on purpose.
mc ilm rule import "$ALIAS/$S3_BUCKET" <<EOF
{"Rules":[{"ID":"expire-abandoned-quarantine","Status":"Enabled","Filter":{"Prefix":"$QUARANTINE_PREFIX/"},"Expiration":{"Days":$QUARANTINE_EXPIRY_DAYS}}]}
EOF

# Verify, do not merely set — the same discipline the anonymous-policy check above exists for.
# An expiry rule that silently failed to land is indistinguishable from a working one right up
# until the volume fills, which is the failure this requirement was written to prevent.
#
# `mc ilm rule export` exits 1 on a bucket with no lifecycle at all ("Unable to get lifecycle
# configuration", measured). Piping through `tr` is what keeps `set -e` from turning that into
# an abrupt shell exit instead of the message below. Parsed by shell expansion because the
# minio/mc image ships no sed, awk or grep.
lifecycle=$(mc ilm rule export "$ALIAS/$S3_BUCKET" | tr -d ' \t\n')

# Reads $lifecycle; $1 is the marker that must be present, $2 how to describe it to a human.
require_lifecycle() {
  case "$lifecycle" in
    *"$1"*) return 0 ;;
  esac
  echo "minio-init: REFUSING to report ready — the orphan reaper is not in place on" \
    "'$S3_BUCKET/$QUARANTINE_PREFIX/': expected $2, got '${lifecycle:-no lifecycle at all}'." \
    "Abandoned presigned uploads would accumulate until the volume fills (FR-019)." >&2
  exit 1
}

require_lifecycle "\"Prefix\":\"$QUARANTINE_PREFIX/\"" "a rule scoped to '$QUARANTINE_PREFIX/'"
require_lifecycle "\"Days\":$QUARANTINE_EXPIRY_DAYS" "expiry after $QUARANTINE_EXPIRY_DAYS days"
require_lifecycle '"Status":"Enabled"' 'the rule to be Enabled'

echo "minio-init: bucket '$S3_BUCKET' ready, '$QUARANTINE_PREFIX/' not publicly served," \
  "abandoned uploads expire after ${QUARANTINE_EXPIRY_DAYS}d"
