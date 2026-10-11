#!/usr/bin/env bash
# Nightly pg_dump of n8n's own Postgres on the EMMA VPS (workflows, encrypted credentials, users, settings).
# Installed as /opt/leadvelocity-n8n/backup.sh and run by /etc/cron.d/lv-n8n-backup. Keeps the newest $KEEP dumps.
# Restore: /opt/leadvelocity-n8n/dc stop n8n
#          /opt/leadvelocity-n8n/dc exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < <dump>
#          /opt/leadvelocity-n8n/dc start n8n
# Credentials in the dump stay encrypted with N8N_ENCRYPTION_KEY (keep that key in the password manager).
set -euo pipefail
umask 077
D=/opt/leadvelocity-n8n
OUT="$D/backups"
KEEP="${KEEP:-14}"
mkdir -p "$OUT"
f="$OUT/n8n-$(date -u +%Y%m%dT%H%M%SZ).dump"
"$D/dc" exec -T postgres sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$f.part"
[ -s "$f.part" ] || { echo "$(date -u +%FT%TZ) backup FAILED: empty dump"; rm -f "$f.part"; exit 1; }
mv "$f.part" "$f"
ls -1t "$OUT"/n8n-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --
echo "$(date -u +%FT%TZ) backup ok $(basename "$f") $(stat -c %s "$f") bytes, $(ls -1 "$OUT"/n8n-*.dump | wc -l) kept"
