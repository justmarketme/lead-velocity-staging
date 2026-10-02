#!/usr/bin/env bash
# Hand-check harness: builds a scratch DB, loads the contract stub, params, watchlist, kill/scale, W14, seed, then prints every tile and runs the branch scenarios.
# Usage: PGHOST=/tmp PGPORT=5544 PGUSER=postgres bash analytics/tests/run-all.sh   (any throwaway Postgres 14+; never run against production)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-smc_check}
psql -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
P="psql -q -v ON_ERROR_STOP=1 -d $DB"
for f in tests/facts-contract.test.sql params.sql watchlist.sql kill-scale.sql W14-lv.sql W14-broker.sql tests/synthetic-seed.sql; do $P -f "$f"; done
$P -c "set facts.as_of='2026-10-18'" \
   -c "select tile_no, tile, scope, value, target, status, n, last_period from (select * from facts.v_watchlist_0_cpl_vs_model union all select * from facts.v_watchlist_1_cost_per_good_fit union all select * from facts.v_watchlist_2_leads_we_could_reach union all select * from facts.v_watchlist_3_booked_to_attended union all select * from facts.v_watchlist_4_broker_good_fit_rate) t where scope = 'ALL' order by 1"
$P -f tests/scenarios.test.sql
