#!/usr/bin/env bash
# pg_dump_nightly.sh: nightly encrypted, off-server backup (Section 7 "nightly pg_dump copied off-server").
# Runs on the VPS from /etc/cron.d/lv-backup (see BACKUP.md). Idempotent; safe to re-run; never writes plaintext off-box.
#   pg_dump_nightly.sh            nightly: CRM schemas on Supabase + n8n's own Postgres -> age-encrypt -> S3-compatible bucket
#   pg_dump_nightly.sh --consent  monthly: consent-evidence archive (5-year prefix, see BACKUP.md section 3)
#   pg_dump_nightly.sh --dsr-exports  only step 6: delete DSR export files older than 7 days (W34, I-38b)
#   pg_dump_nightly.sh --selftest offline check of the encrypt/decrypt path with a throwaway key (no network, no DB)
#   DRY_RUN=1 pg_dump_nightly.sh  print what would happen
# Config (names only; values in /etc/lv/backup.env, root 0600): BACKUP_DB_URL, BACKUP_AGE_RECIPIENT | BACKUP_GPG_RECIPIENT,
#   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY,
#   BACKUP_LOCAL_DIR (default /var/backups/lv), BACKUP_SCHEMAS (default "public ops facts"),
#   BACKUP_CONSENT_TABLES (default "public.leads public.consent_records public.suppression"), LV_COMPOSE_DIR (default /opt/lead-velocity),
#   OPS_PING_URL (optional dead-man heartbeat), PG_DUMP_IMAGE (default postgres:17-alpine),
#   OPS_FEEDER_DB_URL (n8n_app role; unset = feeders skipped), OPS_MONITORS (default "api"), OPS_PAGE_REPORT_DIR
#   (default $LV_COMPOSE_DIR/landing/reports), OPS_PAGE_BRAND_CODE (default SMC), OPS_BUILD_SHA, NODE_IMAGE (default node:22-alpine),
#   W34_EXPORT_DIR (default /home/node/compliance/dsr-exports), LV_COMPOSE_PROJECT (default lv), DSR_EXPORT_HOST_DIR (optional).
set -Eeuo pipefail
umask 077
ENV_FILE="${BACKUP_ENV_FILE:-/etc/lv/backup.env}"
[[ -f "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a
MODE="${1:-nightly}"
LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/lv}"
SCHEMAS="${BACKUP_SCHEMAS:-public ops facts}"
CONSENT_TABLES="${BACKUP_CONSENT_TABLES:-public.leads public.consent_records public.suppression}"
COMPOSE_DIR="${LV_COMPOSE_DIR:-/opt/lead-velocity}"
PG_IMAGE="${PG_DUMP_IMAGE:-postgres:17-alpine}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log() { printf '%s pg_dump_nightly[%s] %s\n' "$(date -u +%FT%TZ)" "$MODE" "$*"; }   # never logs URLs or keys
run() { if [[ -n "${DRY_RUN:-}" ]]; then log "DRY_RUN: $*"; else "$@"; fi; }

encrypt() { # stdin -> stdout; refuses to emit plaintext
  if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && command -v age >/dev/null; then age -r "$BACKUP_AGE_RECIPIENT"
  elif [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]] && command -v gpg >/dev/null; then gpg --batch --yes --trust-model always -e -r "$BACKUP_GPG_RECIPIENT"
  else log "FATAL: no encryption available (install age, set BACKUP_AGE_RECIPIENT). Plaintext is never written off-box."; return 3; fi
}
ext() { if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && command -v age >/dev/null; then echo age; else echo gpg; fi; }

if [[ "$MODE" == "--selftest" ]]; then
  command -v age-keygen >/dev/null || { echo "selftest: age not installed (apt install age)"; exit 2; }
  t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
  age-keygen -o "$t/k" 2>/dev/null; BACKUP_AGE_RECIPIENT="$(age-keygen -y "$t/k")"
  printf 'synthetic-backup-%s' "$TS" > "$t/p"
  encrypt < "$t/p" > "$t/c"
  if grep -q synthetic "$t/c"; then echo "selftest: ciphertext contains plaintext"; exit 1; fi
  age -d -i "$t/k" < "$t/c" | cmp - "$t/p"
  echo "selftest: encrypt/decrypt round trip OK ($(ext))"; exit 0
fi

# --- 6) DSR export files (W34 "D Export", I-38b). They hold personal information and are kept only until the IO has
#        sent them: anything older than 7 days is deleted every night. Best effort (never fails the backup); logs counts,
#        never file names. Default: inside the running n8n container of compose project LV_COMPOSE_PROJECT (default lv);
#        DSR_EXPORT_HOST_DIR instead when the folder is a host bind mount. Also runnable alone: --dsr-exports.
dsr_exports() {
  local dir="${W34_EXPORT_DIR:-/home/node/compliance/dsr-exports}" mins=$((7 * 1440)) n=0 cid
  [[ "$dir" =~ ^/[A-Za-z0-9._/-]+$ && "$dir" != *..* ]] || { log "dsr exports: W34_EXPORT_DIR is not a plain absolute path; skipped"; return 1; }
  if [[ -n "${DSR_EXPORT_HOST_DIR:-}" ]]; then
    [[ -d "$DSR_EXPORT_HOST_DIR" ]] || { log "dsr exports: host dir absent; nothing to delete"; return 0; }
    n="$(find "$DSR_EXPORT_HOST_DIR" -maxdepth 1 -type f -mmin +"$mins" | wc -l)"
    run find "$DSR_EXPORT_HOST_DIR" -maxdepth 1 -type f -mmin +"$mins" -delete
  elif command -v docker >/dev/null; then
    cid="$(docker ps -q --filter "label=com.docker.compose.project=${LV_COMPOSE_PROJECT:-lv}" --filter label=com.docker.compose.service=n8n | head -n1)"
    [[ -n "$cid" ]] || { log "dsr exports: n8n container not running; skipped"; return 0; }
    n="$(docker exec "$cid" sh -c "if [ -d '$dir' ]; then find '$dir' -maxdepth 1 -type f -mmin +$mins | wc -l; else echo 0; fi")"
    run docker exec "$cid" sh -c "[ ! -d '$dir' ] || find '$dir' -maxdepth 1 -type f -mmin +$mins -delete"
  else log "dsr exports: no docker and no DSR_EXPORT_HOST_DIR; skipped"; return 0; fi
  log "dsr exports: $((n)) file(s) older than 7 days ${DRY_RUN:+would be }deleted"
}
if [[ "$MODE" == "--dsr-exports" ]]; then dsr_exports; exit $?; fi

s3_put() { # file key  (SigV4 via curl >= 7.75; key is write-only to one bucket)
  local f="$1" k="$2"
  run curl -sS --fail --retry 3 --retry-delay 10 --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-auto}:s3" \
    --user "${BACKUP_S3_ACCESS_KEY}:${BACKUP_S3_SECRET_KEY}" -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
    -T "$f" "${BACKUP_S3_ENDPOINT%/}/${BACKUP_S3_BUCKET}/${k}" -o /dev/null
}
pg_dump_cmd() { # args... ; uses a pinned client image when docker exists (client must be >= server major)
  if command -v docker >/dev/null; then docker run --rm -i --network host -e PGCONNECT_TIMEOUT=20 "$PG_IMAGE" pg_dump "$@"
  else pg_dump "$@"; fi
}
record() { # kind ok bytes sha location note -> ops.backup_runs (role backup_reader has INSERT there only)
  local sql="INSERT INTO ops.backup_runs (kind, started_at, finished_at, ok, bytes, sha256, location, note) VALUES ('$1', '$STARTED', now(), $2, ${3:-0}, '${4:-}', '${5:-}', '${6:-}');"
  if command -v psql >/dev/null; then run psql "$BACKUP_DB_URL" -qtAc "$sql" >/dev/null || log "WARN: could not record run"
  elif command -v docker >/dev/null; then run docker run --rm -i --network host "$PG_IMAGE" psql "$BACKUP_DB_URL" -qtAc "$sql" >/dev/null || log "WARN: could not record run"; fi
}
fail() { log "FAILED at line $1"; record pg_dump false 0 "" "" "failed line $1"; exit 1; }
trap 'fail $LINENO' ERR

for v in BACKUP_DB_URL BACKUP_S3_ENDPOINT BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY BACKUP_S3_SECRET_KEY; do
  [[ -n "${!v:-}" ]] || { log "FATAL: $v not set (see $ENV_FILE)"; exit 2; }
done
exec 9>"/tmp/lv-backup.lock"; flock -n 9 || { log "another backup is running; exiting"; exit 0; }
mkdir -p "$LOCAL_DIR"
E="$(ext)"

if [[ "$MODE" == "--consent" ]]; then
  MONTH="$(date -u +%Y-%m)"; out="$LOCAL_DIR/consent-$MONTH.dump.$E"
  args=(); for t in $CONSENT_TABLES; do args+=(-t "$t"); done
  log "consent archive: ${#args[@]} table args"
  pg_dump_cmd --format=custom --no-owner --no-privileges "${args[@]}" "$BACKUP_DB_URL" | encrypt > "$out.part"
  mv "$out.part" "$out"
  sha="$(sha256sum "$out" | cut -d' ' -f1)"; bytes="$(stat -c %s "$out")"
  s3_put "$out" "consent/$MONTH/consent-$MONTH.dump.$E"      # 'consent/' prefix: 5-year lifecycle rule
  record pg_dump true "$bytes" "$sha" "consent/$MONTH" "consent archive"
  log "consent archive OK ($bytes bytes)"; exit 0
fi

# --- nightly: 1) CRM schemas on Supabase
D="$(date -u +%Y/%m/%d)"; crm="$LOCAL_DIR/crm-$TS.dump.$E"
nargs=(); for s in $SCHEMAS; do nargs+=(-n "$s"); done
log "dumping CRM schemas: $SCHEMAS"
pg_dump_cmd --format=custom --no-owner --no-privileges "${nargs[@]}" "$BACKUP_DB_URL" | encrypt > "$crm.part"
mv "$crm.part" "$crm"
# --- 2) n8n's own Postgres (workflows, credentials encrypted by N8N_ENCRYPTION_KEY, users) if the stack runs here
n8n=""
if command -v docker >/dev/null && [[ -f "$COMPOSE_DIR/automation/docker-compose.yml" ]] \
   && docker compose -p lv -f "$COMPOSE_DIR/automation/docker-compose.yml" ps --status running postgres >/dev/null 2>&1; then
  n8n="$LOCAL_DIR/n8n-$TS.dump.$E"
  docker compose -p lv -f "$COMPOSE_DIR/automation/docker-compose.yml" exec -T postgres \
    sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' | encrypt > "$n8n.part"
  mv "$n8n.part" "$n8n"
fi
# --- 3) off-server copy (bucket lifecycle deletes pg/ after 30 days)
for f in "$crm" $n8n; do s3_put "$f" "pg/$D/$(basename "$f")"; done
sha="$(sha256sum "$crm" | cut -d' ' -f1)"; bytes="$(stat -c %s "$crm")"
record pg_dump true "$bytes" "$sha" "pg/$D" "crm${n8n:+ + n8n}"
# --- 5) ops feeders (I-22), best effort: a feeder problem never fails the backup. Runs as n8n_app, not backup_reader
#        (backup_reader stays dump-only + INSERT on ops.backup_runs). ops.infra_day for yesterday (SAST) from W22's uptime
#        rows; ops.page_day + ops.page_audits from Lighthouse reports dropped in OPS_PAGE_REPORT_DIR (moved to fed/ after).
psql_cmd() { if command -v psql >/dev/null; then psql "$@"; else docker run --rm -i --network host "$PG_IMAGE" psql "$@"; fi; }
feeders() {
  [[ -n "${OPS_FEEDER_DB_URL:-}" ]] || { log "ops feeders: OPS_FEEDER_DB_URL not set; skipped"; return 0; }
  local here day rdir dist n
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  day="$(TZ=Africa/Johannesburg date -d yesterday +%F)"
  if [[ -n "${DRY_RUN:-}" ]]; then log "DRY_RUN: ops.infra_day for $day; pages from ${OPS_PAGE_REPORT_DIR:-$COMPOSE_DIR/landing/reports}"; return 0; fi
  n="$(psql_cmd "$OPS_FEEDER_DB_URL" -v ON_ERROR_STOP=1 -qtA -v day="$day" -v monitors="${OPS_MONITORS:-api}" < "$here/ops_feeders.sql" | grep -c . || true)"
  log "ops feeders: infra_day $day, $n monitor row(s)"
  rdir="${OPS_PAGE_REPORT_DIR:-$COMPOSE_DIR/landing/reports}"; dist="$COMPOSE_DIR/landing/dist"
  compgen -G "$rdir/*.report.json" >/dev/null || return 0
  if command -v node >/dev/null; then node "$here/ops_feeders.mjs" pages "$rdir" --dist "$dist"
  else docker run --rm -i -e OPS_PAGE_BRAND_CODE -e OPS_BUILD_SHA -v "$here":/f:ro -v "$rdir":/r:ro -v "$dist":/d:ro \
         "${NODE_IMAGE:-node:22-alpine}" node /f/ops_feeders.mjs pages /r --dist /d; fi | psql_cmd "$OPS_FEEDER_DB_URL" -v ON_ERROR_STOP=1 -qtA >/dev/null
  mkdir -p "$rdir/fed" && mv "$rdir"/*.report.json "$rdir/fed/"
  log "ops feeders: page reports loaded"
}
feeders || log "WARN: ops feeders failed (backup itself is fine)"
# --- 4) local retention: 7 days of encrypted files (the 30-day copy lives off-server)
run find "$LOCAL_DIR" -maxdepth 1 -type f \( -name 'crm-*' -o -name 'n8n-*' \) -mtime +7 -delete
dsr_exports || log "WARN: DSR export clean-up failed (backup itself is fine)"
[[ -n "${OPS_PING_URL:-}" ]] && run curl -fsS -m 10 "$OPS_PING_URL" -o /dev/null || true
log "nightly OK ($bytes bytes CRM${n8n:+, n8n included})"
