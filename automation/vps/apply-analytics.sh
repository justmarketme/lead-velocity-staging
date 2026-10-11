#!/usr/bin/env bash
# apply-analytics.sh: W26 step 12 (integration pass 2, I-35k). Applies the analytics layer AFTER the Supabase migrations
# (supabase/migrations/*_smc_01..10), in this fixed order, as ONE transaction:
#   analytics/params.sql -> watchlist.sql -> kill-scale.sql -> W14-broker.sql -> W14-lv.sql
# Idempotent: every file is CREATE OR REPLACE / DROP IF EXISTS + CREATE, so a re-run rebuilds the same objects.
# All-or-nothing: one BEGIN ... COMMIT; any error stops psql (ON_ERROR_STOP) and nothing is kept.
#   automation/vps/apply-analytics.sh --print     # list the files in order; no database contact
#   automation/vps/apply-analytics.sh             # DRY RUN (default): runs everything, then ROLLBACK
#   automation/vps/apply-analytics.sh --apply     # runs everything, then COMMIT
# Target: ANALYTICS_DB_URL from the repo-root .env (laptop only; a DDL-capable owner of schema facts; stripped from the
# VPS .env by provision.sh step 5). Never prints the URL. Refuses to run if the migrations are not applied.
set -Eeuo pipefail
umask 077
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENVF="${PROVISION_ENV_FILE:-$REPO/.env}"
MODE=dry-run
while [[ $# -gt 0 ]]; do case "$1" in
  --apply) MODE=apply ;; --dry-run) MODE=dry-run ;; --print) MODE=print ;;
  -h|--help) sed -n '2,12p' "$0"; exit 0 ;; *) echo "unknown arg: $1"; exit 2 ;; esac; shift; done
FILES=(params.sql watchlist.sql kill-scale.sql W14-broker.sql W14-lv.sql)
for f in "${FILES[@]}"; do [[ -f "$REPO/analytics/$f" ]] || { echo "missing analytics/$f"; exit 2; }; done
if [[ "$MODE" == print ]]; then
  echo "analytics layer, in order (one transaction):"; i=0; for f in "${FILES[@]}"; do i=$((i+1)); echo "  $i analytics/$f"; done; exit 0
fi
[[ -f "$ENVF" ]] && { set -a; . "$ENVF"; set +a; }
: "${ANALYTICS_DB_URL:?set ANALYTICS_DB_URL in .env (name only in automation/.env.example)}"
command -v psql >/dev/null || { echo "psql not found (apt install postgresql-client-16)"; exit 2; }
# Precondition: the migrations have run (facts schema from smc_04, disposition enum from smc_02/06 that params.sql overloads on).
ready=$(psql "$ANALYTICS_DB_URL" -XAtq -v ON_ERROR_STOP=1 -c \
  "select (to_regnamespace('facts') is not null and to_regtype('public.smc_disposition_code') is not null)::int")
[[ "$ready" == 1 ]] || { echo "HALT: migrations not applied (facts schema / smc_disposition_code missing). Apply supabase/migrations first."; exit 3; }
{
  echo '\set ON_ERROR_STOP on'
  echo 'BEGIN;'
  for f in "${FILES[@]}"; do echo "\\echo applying analytics/$f"; echo "\\i '$REPO/analytics/$f'"; done
  if [[ "$MODE" == apply ]]; then echo 'COMMIT;'; else echo '\echo DRY RUN: rolling back'; echo 'ROLLBACK;'; fi
} | psql "$ANALYTICS_DB_URL" -X -q -v ON_ERROR_STOP=1 -f -
echo "analytics layer: ${MODE} OK (${#FILES[@]} files)"
