#!/usr/bin/env bash
# restore.sh: decrypt and restore a backup made by pg_dump_nightly.sh. Runs where the age PRIVATE key is,
# i.e. the operator laptop (the key is never on the VPS). Default target is a throwaway container (the monthly test).
#   restore.sh --test  [--file F | --key-path pg/YYYY/MM/DD/crm-….dump.age]   monthly restore test into a scratch DB
#   restore.sh --into "$TARGET_DB_URL" --file F                                real restore (asks to type RESTORE)
#   restore.sh --n8n  --file n8n-….dump.age                                    restore n8n's DB into the local/VPS n8n postgres
# Needs: AGE_KEY_FILE (path to the private key, from the password manager, deleted after use), docker,
#   plus BACKUP_S3_* to fetch by key, and BACKUP_DB_URL to record the test result.
set -Eeuo pipefail
umask 077
[[ -f "${BACKUP_ENV_FILE:-/etc/lv/backup.env}" ]] && set -a && . "${BACKUP_ENV_FILE:-/etc/lv/backup.env}" && set +a
MODE=""; FILE=""; KEY=""; INTO=""
while [[ $# -gt 0 ]]; do case "$1" in
  --test) MODE=test ;; --n8n) MODE=n8n ;; --into) MODE=into; INTO="$2"; shift ;;
  --file) FILE="$2"; shift ;; --key-path) KEY="$2"; shift ;; *) echo "unknown arg $1"; exit 2 ;; esac; shift; done
[[ -n "$MODE" ]] || { sed -n '2,9p' "$0"; exit 2; }
PG_IMAGE="${PG_DUMP_IMAGE:-postgres:17-alpine}"
SANITY="${BACKUP_SANITY_TABLES:-public.leads ops.notifications}"
STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log() { printf '%s restore[%s] %s\n' "$(date -u +%FT%TZ)" "$MODE" "$*"; }
work="$(mktemp -d)"; cid=""
cleanup() { [[ -n "$cid" ]] && docker rm -f "$cid" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

if [[ -z "$FILE" && -n "$KEY" ]]; then
  FILE="$work/$(basename "$KEY")"
  curl -sS --fail --aws-sigv4 "aws:amz:${BACKUP_S3_REGION:-auto}:s3" --user "${BACKUP_S3_READ_ACCESS_KEY:-$BACKUP_S3_ACCESS_KEY}:${BACKUP_S3_READ_SECRET_KEY:-$BACKUP_S3_SECRET_KEY}" \
    "${BACKUP_S3_ENDPOINT%/}/${BACKUP_S3_BUCKET}/${KEY}" -o "$FILE"
fi
[[ -f "$FILE" ]] || { log "no backup file"; exit 2; }
dump="$work/db.dump"
case "$FILE" in
  *.age) [[ -f "${AGE_KEY_FILE:-}" ]] || { log "set AGE_KEY_FILE"; exit 2; }; age -d -i "$AGE_KEY_FILE" -o "$dump" "$FILE" ;;
  *.gpg) gpg --batch -d -o "$dump" "$FILE" ;;
  *) log "refusing unencrypted input"; exit 2 ;;
esac
docker run --rm -i "$PG_IMAGE" pg_restore --list < "$dump" > "$work/toc" || { log "pg_restore cannot read the archive"; exit 1; }
log "archive readable: $(grep -c ' TABLE DATA ' "$work/toc" || true) table-data entries"

restore_into() { docker run --rm -i --network host "$PG_IMAGE" pg_restore --no-owner --no-privileges --clean --if-exists -d "$1" < "$dump"; }

case "$MODE" in
  test)
    pw="$(openssl rand -hex 16)"
    cid="$(docker run -d -e POSTGRES_PASSWORD="$pw" -p 127.0.0.1::5432 "$PG_IMAGE")"
    port="$(docker port "$cid" 5432/tcp | head -1 | sed 's/.*://')"
    for _ in $(seq 1 30); do docker exec "$cid" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    url="postgresql://postgres:${pw}@127.0.0.1:${port}/postgres"
    docker exec "$cid" psql -U postgres -qc 'create role authenticated; create role anon; create role service_role;' >/dev/null 2>&1 || true
    restore_into "$url" || log "pg_restore reported errors (Supabase-managed roles/extensions are expected); checking data"
    ok=true; note=""
    for t in $SANITY; do
      n="$(docker exec "$cid" psql -U postgres -tAc "select count(*) from $t" 2>/dev/null || echo ERR)"
      note+="$t=$n "; [[ "$n" == ERR ]] && ok=false
    done
    log "sanity: $note"
    if [[ -n "${BACKUP_DB_URL:-}" ]]; then
      docker run --rm -i --network host "$PG_IMAGE" psql "$BACKUP_DB_URL" -qtAc \
        "INSERT INTO ops.backup_runs (kind, started_at, finished_at, ok, location, note) VALUES ('restore_test', '$STARTED', now(), $ok, '$(basename "$FILE")', '${note% }');" >/dev/null || log "WARN: result not recorded"
    fi
    $ok && log "RESTORE TEST PASSED" || { log "RESTORE TEST FAILED"; exit 1; } ;;
  into)
    read -r -p "Restore over the target database? This replaces objects in the dumped schemas. Type RESTORE: " a
    [[ "$a" == RESTORE ]] || exit 1
    restore_into "$INTO"; log "restored" ;;
  n8n)
    dir="${LV_COMPOSE_DIR:-/opt/lead-velocity}"
    docker compose -p lv -f "$dir/automation/docker-compose.yml" stop n8n
    docker compose -p lv -f "$dir/automation/docker-compose.yml" exec -T postgres \
      sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$dump"
    docker compose -p lv -f "$dir/automation/docker-compose.yml" start n8n
    log "n8n DB restored (same N8N_ENCRYPTION_KEY required for credentials)" ;;
esac
