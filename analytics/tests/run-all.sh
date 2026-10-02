#!/usr/bin/env bash
# Scratch-database harness against the REAL schema. Never run against production.
# Prereq: a database $BASE (default smc_base) holding the Supabase stub + the repo migrations + supabase/migrations/20261002_smc_01..05 (+ smc_06 if present).
# Builds two copies from it:
#   $REAL_DB (smc_real) = platform-architect's seed (supabase/seed/smc_synthetic.sql) + the analytics views  -> "what do the seven tiles show on the real seed?"
#   $FIX_DB  (smc_fix)  = analytics' own 30-lead cycle (tests/synthetic-seed.sql) + the views              -> branch scenarios (tests/scenarios.test.sql), reconcile, W14
# Usage: PGHOST=127.0.0.1 PGPORT=54330 PGUSER=postgres bash analytics/tests/run-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${BASE:-smc_base}; REAL_DB=${REAL_DB:-smc_real}; FIX_DB=${FIX_DB:-smc_fix}
SEED=../supabase/seed/smc_synthetic.sql
for db in "$REAL_DB" "$FIX_DB"; do psql -q -d postgres -c "drop database if exists $db" -c "create database $db template $BASE" 2>&1 | grep -v NOTICE || true; done
VIEWS="params.sql watchlist.sql kill-scale.sql W14-lv.sql W14-broker.sql W14-broker-payload.sql"
load() { local db=$1; psql -q -v ON_ERROR_STOP=1 -d "$db" -f tests/facts-contract.test.sql >/dev/null; for f in $VIEWS; do psql -q -v ON_ERROR_STOP=1 -d "$db" -f "$f" 2>&1 | grep -v NOTICE || true; done; }
# 1. real platform seed
(echo "SET smc.allow_synthetic = 'on';"; cat "$SEED") | psql -q -v ON_ERROR_STOP=1 -d "$REAL_DB" >/dev/null
load "$REAL_DB"
echo "=== REAL SEED: the seven tiles (analytics views) ==="
psql -d "$REAL_DB" -f tests/print-tiles.sql
echo "=== REAL SEED: facts.v_watchlist (platform-architect) next to the analytics tiles ==="
psql -d "$REAL_DB" -f tests/watchlist-reconcile.test.sql
echo "=== REAL SEED: W14 broker report, reconcile, hold ==="
psql -d "$REAL_DB" -At -c "select check_name || ' = ' || ok from facts.w14_reconcile('00000000-0000-4000-8000-0000000b0001') where not ok" -c "select 'hold=' || facts.w14_hold('00000000-0000-4000-8000-0000000b0001')"
# 2. analytics fixture
psql -q -v ON_ERROR_STOP=1 -d "$FIX_DB" -c "SET smc.allow_synthetic = 'on'" -f tests/synthetic-seed.sql >/dev/null 2>&1 || { (echo "SET smc.allow_synthetic = 'on';"; cat tests/synthetic-seed.sql) | psql -q -v ON_ERROR_STOP=1 -d "$FIX_DB" >/dev/null; }
load "$FIX_DB"
echo "=== FIXTURE: the seven tiles ==="
psql -d "$FIX_DB" -f tests/print-tiles.sql
echo "=== FIXTURE: branch scenarios ==="
psql -d "$FIX_DB" -f tests/scenarios.test.sql
