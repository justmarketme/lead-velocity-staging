#!/usr/bin/env bash
# nh15-apply.sh - NH-11 schema dump, collision check, guarded apply of migration 01 (NH-15), post-check.
#
# Run on the LAPTOP only, from the repo root, after Jonathan has replied "NH-15 yes".
# Needs: supabase CLI (logged in), psql, grep. No secrets are stored in this file.
#
# Reads from the environment (or from .env in the repo root, or ENV_FILE=...):
#   SUPABASE_DB_URL        Postgres connection string of the live project (owner role). Never printed.
#   SUPABASE_PROJECT_REF   Optional. Only used if SUPABASE_DB_URL is empty AND the project is already
#                          linked (supabase link --project-ref ...); then the dump uses --linked.
#                          Applying (steps c and d) always needs SUPABASE_DB_URL.
#
# Usage:
#   scripts/nh15-apply.sh             # steps a, b, then asks YES, then c, d
#   scripts/nh15-apply.sh --check     # steps a, b and d only: never applies, asks nothing
#   scripts/nh15-apply.sh --postcheck # step d only (run it any time to re-test)
#   DUMP_DATE=2026-10-05 scripts/nh15-apply.sh   # override the date in the dump file name
#
# Steps:
#   a  supabase db dump --schema-only  ->  supabase/live_schema_<date>.sql   (read-only, NH-11)
#   b  compare the dump with migration 01 and print a summary; then a rolled-back trial run
#      (BEGIN; migration; ROLLBACK) against the live database, so SQL errors show before anything is kept
#   c  apply migration 01 in ONE transaction, only after you type YES
#   d  post-check: RLS on, new policies present, old policies gone, bucket private, anon locked out; PASS/FAIL
#
# Exit codes: 0 all good, 1 a check failed or you declined, 2 setup problem.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
MIGRATION="$ROOT/supabase/migrations/20261002_smc_01_security.sql"
DUMP_DATE="${DUMP_DATE:-$(date +%F)}"
DUMP="$ROOT/supabase/live_schema_${DUMP_DATE}.sql"
MODE="full"

case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  --postcheck) MODE="postcheck" ;;
  -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
  *) echo "unknown argument: $1" >&2; exit 2 ;;
esac

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DB_URL="${SUPABASE_DB_URL:-}"
FAILS=0

say()  { printf '%s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; FAILS=$((FAILS + 1)); }
warn() { printf 'NOTE  %s\n' "$*"; }

need() { command -v "$1" >/dev/null 2>&1 || { echo "$1 is required but not installed" >&2; exit 2; }; }
need psql
[[ -f "$MIGRATION" ]] || { echo "migration not found: $MIGRATION" >&2; exit 2; }

run_sql() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

# ---------------------------------------------------------------- d. post-check
postcheck() {
  [[ -n "$DB_URL" ]] || { echo "SUPABASE_DB_URL is not set" >&2; exit 2; }
  say ""
  say "== d. Post-check =="
  local t
  for t in broker_onboarding_responses broker_analysis appointments broker_notes leads communications; do
    if [[ "$(run_sql -c "select relrowsecurity from pg_class where oid = to_regclass('public.$t')")" == "t" ]]; then
      pass "RLS on: public.$t"
    else
      fail "RLS NOT on (or table missing): public.$t"
    fi
  done

  local p
  for p in "smc_sec admins manage onboarding responses" "smc_sec broker reads own onboarding response" \
           "smc_sec admins manage broker analysis" "smc_sec admins manage appointments" \
           "Brokers can see their appointments" "smc_sec admins manage notes" \
           "smc_sec brokers download shared documents"; do
    if [[ "$(run_sql -c "select count(*) from pg_policies where policyname = '${p//\'/\'\'}'")" -ge 1 ]]; then
      pass "policy present: $p"
    else
      fail "policy MISSING: $p"
    fi
  done

  for p in "Deny anonymous access to leads" "Deny anonymous access to communications" "Public Access" \
           "Service role full access to responses" "Service role full access to analysis" \
           "Admins can manage all appointments" "Admins can manage all notes"; do
    if [[ "$(run_sql -c "select count(*) from pg_policies where policyname = '${p//\'/\'\'}'")" -eq 0 ]]; then
      pass "old policy gone: $p"
    else
      fail "old policy STILL PRESENT: $p"
    fi
  done

  local pub
  pub="$(run_sql -c "select coalesce((select public::text from storage.buckets where id = 'admin-documents'), 'absent')")"
  if [[ "$pub" == "false" || "$pub" == "absent" ]]; then pass "bucket admin-documents private ($pub)"; else fail "bucket admin-documents is still public"; fi

  for t in leads communications brokers appointments broker_notes broker_analysis; do
    if [[ "$(run_sql -c "select coalesce(has_table_privilege('anon', to_regclass('public.$t'), 'SELECT'), false)")" == "f" ]]; then
      pass "anon cannot SELECT public.$t"
    else
      fail "anon CAN still SELECT public.$t"
    fi
  done

  if [[ "$(run_sql -c "select has_table_privilege('anon', 'public.broker_onboarding_responses', 'INSERT')")" == "t" ]]; then
    pass "anon can still INSERT on broker_onboarding_responses (public form kept, as designed)"
  else
    fail "anon lost INSERT on broker_onboarding_responses: the public onboarding form would break"
  fi

  say ""
  if [[ "$FAILS" -eq 0 ]]; then say "RESULT: PASS (all post-checks)"; else say "RESULT: FAIL ($FAILS check(s) failed)"; return 1; fi
}

if [[ "$MODE" == "postcheck" ]]; then postcheck; exit $?; fi

# ---------------------------------------------------------------- a. dump (NH-11)
say "== a. Schema-only dump (NH-11, read-only) =="
need supabase
if [[ -n "$DB_URL" ]]; then
  supabase db dump --schema-only --db-url "$DB_URL" -f "$DUMP"
elif [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  warn "SUPABASE_DB_URL empty: using the linked project (ref ${SUPABASE_PROJECT_REF}). Link it first with: supabase link --project-ref \$SUPABASE_PROJECT_REF"
  supabase db dump --schema-only --linked -f "$DUMP"
else
  echo "Set SUPABASE_DB_URL (or SUPABASE_PROJECT_REF for a linked project) in .env first." >&2; exit 2
fi
[[ -s "$DUMP" ]] || { echo "dump is empty: $DUMP" >&2; exit 2; }
say "Wrote $DUMP ($(wc -l < "$DUMP") lines). Schema only, no row data."

# ---------------------------------------------------------------- b. collision check
say ""
say "== b. Does migration 01 fit the live schema? =="
in_dump() { grep -Eiq -- "$1" "$DUMP"; }

for t in broker_onboarding_responses broker_analysis appointments broker_notes leads communications \
         admin_documents document_shares brokers broker_reset_requests; do
  if in_dump "CREATE TABLE (IF NOT EXISTS )?\"?public\"?\.\"?$t\"? "; then pass "table exists live: public.$t"; else fail "table NOT in live dump: public.$t (migration would error)"; fi
done
if in_dump 'FUNCTION "?public"?\."?has_role"?'; then pass "function public.has_role exists"; else fail "function public.has_role missing (every new policy uses it)"; fi
if in_dump 'TYPE "?public"?\."?app_role"?'; then pass "type public.app_role exists"; else fail "type public.app_role missing"; fi

for p in "Service role full access to responses" "Enable all access for dev" "Service role full access to analysis" \
         "Admins can manage all appointments" "Users can view their own appointments" "Admins can manage all notes" \
         "Public Access" "Brokers can download shared documents" \
         "Deny anonymous access to leads" "Deny anonymous access to communications"; do
  if in_dump "CREATE POLICY \"$p\""; then say "      will be dropped (exists live): $p"; else say "      already absent live (drop is a no-op): $p"; fi
done

for p in "smc_sec admins manage onboarding responses" "smc_sec broker reads own onboarding response" "smc_sec admins manage broker analysis" \
         "smc_sec admins manage appointments" "smc_sec admins manage notes" "smc_sec brokers download shared documents"; do
  if in_dump "CREATE POLICY \"$p\""; then warn "new policy name already live (migration skips it, safe to re-run): $p"; fi
done

# Pre-check from the migration header: the public onboarding form depends on live-only RPCs being SECURITY DEFINER.
for f in submit_broker_onboarding submit_broker_analysis; do
  if in_dump "FUNCTION \"?public\"?\\.\"?$f\"?"; then
    if grep -Ei -A12 -- "FUNCTION \"?public\"?\\.\"?$f\"?" "$DUMP" | grep -qi 'SECURITY DEFINER'; then
      pass "$f is SECURITY DEFINER (public onboarding form keeps working)"
    else
      fail "$f exists but is NOT SECURITY DEFINER: the public onboarding form would stop working. Do not apply."
    fi
  else
    warn "$f not found in the dump (the form may insert directly; test /onboarding after applying)"
  fi
done

# Rolled-back trial run: catches SQL errors against the real schema without keeping anything.
if [[ -n "$DB_URL" ]]; then
  say ""
  say "Trial run against the live database, rolled back (nothing is kept)..."
  if { printf 'BEGIN;\n'; cat "$MIGRATION"; printf '\nROLLBACK;\n'; } | psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 >/dev/null; then
    pass "trial run: migration 01 runs clean and was rolled back"
  else
    fail "trial run: migration 01 raised an error (read it above)"
  fi
else
  warn "SUPABASE_DB_URL not set: skipped the rolled-back trial run (and the apply step)"
fi

say ""
if [[ "$FAILS" -gt 0 ]]; then
  say "RESULT: FAIL ($FAILS problem(s) in step b). Not applying. Show the output above to Claude."
  exit 1
fi
say "RESULT: PASS (step b). Commit the dump later as supabase/live_schema_2026-10.sql if Jonathan agrees."

if [[ "$MODE" == "check" ]]; then
  [[ -n "$DB_URL" ]] && postcheck || true
  exit 0
fi

# ---------------------------------------------------------------- c. apply, guarded
[[ -n "$DB_URL" ]] || { echo "SUPABASE_DB_URL is required to apply" >&2; exit 2; }
say ""
say "== c. Apply migration 01 (security fixes, NH-15) =="
say "This changes LIVE behaviour: anon loses read access to PII tables; brokers see only their own rows;"
say "admin-documents becomes private. One transaction: any error rolls everything back."
read -r -p "Type YES (capitals) to apply to the live database, anything else to stop: " ANSWER
if [[ "$ANSWER" != "YES" ]]; then say "Stopped. Nothing was changed."; exit 1; fi

psql "$DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$MIGRATION"
say "Applied."

postcheck
