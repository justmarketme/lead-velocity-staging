#!/usr/bin/env bash
# Mark's "waiting to book" go-live (24 Oct 2026), one command from the laptop (Git Bash), repo root:
#   bash scripts/go-live-20261024.sh                  # steps 1-4, asks before each one (Enter = yes, n = skip)
#   bash scripts/go-live-20261024.sh db|vps|portal|template      # one step only
#   bash scripts/go-live-20261024.sh switch-on HXxxxxxxxx        # LATER, once Meta approves broker_lead_routed
# Steps:
#   1 db        broker visibility change (docs/APPLY-LIVE-20261024-broker-visibility.sql) + check. Safe to re-run.
#   2 vps       ship this branch to the VPS n8n, import + publish W01 W03 W41. From then on a consented WhatsApp-ad client is
#               told their adviser's name and handed to the adviser at once (route at consent; SMC_ROUTE_AT_CONSENT=false = off),
#               and W41 sweeps up any consented, unrouted client hourly. W41's adviser notice stays silent (SMC_BROKER_LEAD_NOTICE_ENABLED is
#               not touched), and report whether test-practice routing (SMC_TEST_BROKER_IDS) is set.
#   3 portal    vercel --prod (the "Waiting to book" section in Mark's Leads page).
#   4 template  submit broker_lead_routed to Twilio/Meta (dry run shown first) and print the switch-on command.
#   switch-on   checks the template is approved and test routing is set, then puts the SID in TWILIO_CONTENT_SIDS and
#               sets SMC_BROKER_LEAD_NOTICE_ENABLED=true on the VPS. From then on W41 messages advisers hourly, by itself.
# Secrets come from the repo .env and the VPS .env; nothing is printed.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
BRANCH=claude/relaxed-edison-0hcidb
VPS="${VPS:-root@76.13.252.92}"
KEY="${SSH_KEY:-$HOME/.ssh/emma_vps_ed25519}"
D=/opt/leadvelocity-n8n
TEST_PRACTICE=f688380e-fb68-4bfc-a9ee-4bf37ce76dcc
SSH=(ssh -n -i "$KEY" -o BatchMode=yes "$VPS")

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mOK\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m!!\033[0m %s\n' "$*"; }
die()  { printf '   \033[31mSTOPPED\033[0m %s\n' "$*"; exit 1; }
ask()  { local a; read -r -p "   $1 [Y/n] " a </dev/tty || a=n; [[ ! "$a" =~ ^[Nn] ]]; }
envget() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^['\"]|['\"]$//g" || true; }
# Set KEY=VALUE in the VPS .env (value travels base64, so JSON and quotes survive), keep a dated backup.
vps_set() {
  local b64; b64=$(printf '%s' "$2" | base64 | tr -d '\n')
  "${SSH[@]}" "cd $D && cp -p repo/.env repo/.env.bak.\$(date +%Y%m%d%H%M%S) && python3 - '$1' '$b64' <<'PY'
import base64, sys
k, v = sys.argv[1], base64.b64decode(sys.argv[2]).decode()
p = 'repo/.env'; lines = open(p, encoding='utf-8').read().splitlines()
out, done = [], False
for l in lines:
    if l.startswith(k + '='):
        if not done: out.append(k + '=' + v); done = True
    else: out.append(l)
if not done: out.append(k + '=' + v)
open(p, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
PY"
}
vps_get() { "${SSH[@]}" "grep -E '^$1=' $D/repo/.env | tail -1 | cut -d= -f2-" | tr -d '\r'; }

preflight() {
  say "0. Checking the laptop"
  command -v node >/dev/null || die "node is not installed"
  [ -z "$(git status --porcelain --untracked-files=no)" ] || die "you have uncommitted changes; commit or stash them first"
  git fetch -q origin "$BRANCH"
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
  git merge -q --ff-only "origin/$BRANCH" || die "local $BRANCH has diverged from GitHub"
  ok "on $BRANCH at $(git rev-parse --short HEAD)"
  [ -d node_modules/pg ] || { warn "installing packages (npm install)"; npm install --no-audit --no-fund >/dev/null; }
}

step_db() {
  say "1. Database: Mark can see WhatsApp-verified leads and their timeline"
  if node scripts/apply-sql-file.mjs --check-only --check broker-visibility >/dev/null 2>&1; then ok "already applied"; return; fi
  node scripts/apply-sql-file.mjs docs/APPLY-LIVE-20261024-broker-visibility.sql --check broker-visibility || die "database change did not apply (nothing was half-done: it is one transaction)"
  ok "applied and checked"
}

step_vps() {
  say "2. VPS: ship this branch to n8n; load W01, W03 and W41 (route at consent on; adviser notice silent until switch-on)"
  [ -f "$KEY" ] || die "SSH key $KEY not found (set SSH_KEY=...)"
  bash automation/emma-vps/deploy.sh HEAD
  "${SSH[@]}" "bash $D/repo/automation/emma-vps/import_wf.sh W01 W03 W41" || die "workflow import failed (see UNBOUND above: add that credential in n8n, then re-run: bash scripts/go-live-20261024.sh vps)"
  ok "W01, W03, W41 imported and published (route at consent is on)"
  local en ids; en=$(vps_get SMC_BROKER_LEAD_NOTICE_ENABLED || true); ids=$(vps_get SMC_TEST_BROKER_IDS || true)
  ok "SMC_BROKER_LEAD_NOTICE_ENABLED=${en:-unset} (W41 sends nothing until this is true)"
  if [[ "$ids" == *"$TEST_PRACTICE"* ]]; then ok "test-practice routing is set"; else warn "SMC_TEST_BROKER_IDS does not list the test practice ($TEST_PRACTICE): switch-on will refuse until it does"; fi
}

step_portal() {
  say "3. Portal: deploy leadvelocity.co.za (Waiting to book)"
  if command -v vercel >/dev/null; then vercel --prod; else npx --yes vercel@39.3.0 --prod; fi
  ok "deployed: check leadvelocity.co.za/broker/leads as Mark"
}

step_template() {
  say "4. WhatsApp template broker_lead_routed (Meta approval takes 1-48 h)"
  local sids; sids=$(vps_get TWILIO_CONTENT_SIDS 2>/dev/null || true)
  if [[ "$sids" == *'"broker_lead_routed"'* ]]; then ok "already in TWILIO_CONTENT_SIDS on the VPS"; return; fi
  node automation/templates/twilio/submit-twilio.mjs --only broker_lead_routed | grep -E "WOULD|HAVE" || true
  ask "Submit it to Twilio/Meta now?" || { warn "skipped"; return; }
  local out sid; out=$(node automation/templates/twilio/submit-twilio.mjs --only broker_lead_routed --submit) || { echo "$out"; die "submit failed"; }
  echo "$out" | grep -E "MADE|ASKED|HAVE" || true
  sid=$(echo "$out" | sed -nE 's/^(MADE|HAVE) +broker_lead_routed = (HX[0-9a-f]+).*/\2/p' | head -1)
  [ -n "$sid" ] || die "no SID in the output"
  printf '%s\n' "$sid" > .golive-broker_lead_routed.sid
  ok "submitted: $sid. When Meta approves it, run:  bash scripts/go-live-20261024.sh switch-on $sid"
}

switch_on() {
  local sid="${1:-$(cat .golive-broker_lead_routed.sid 2>/dev/null || true)}"
  [[ "$sid" =~ ^HX[0-9a-f]{32}$ ]] || die "usage: bash scripts/go-live-20261024.sh switch-on HX<32 hex>"
  say "Switch on: advisers get a WhatsApp + email when a consented client hasn't booked (W41, hourly)"
  local user pass status
  user=$(envget TWILIO_API_KEY_SID); pass=$(envget TWILIO_API_KEY_SECRET)
  [ -n "$user" ] || { user=$(envget TWILIO_ACCOUNT_SID); pass=$(envget TWILIO_AUTH_TOKEN); }
  status=$(curl -fsS -u "$user:$pass" "https://content.twilio.com/v1/Content/$sid/ApprovalRequests" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).whatsapp.status)}catch(e){console.log("unknown")}})')
  [ "$status" = approved ] || die "template status is '$status', not approved yet; try again later"
  ok "template approved"
  [[ "$(vps_get SMC_TEST_BROKER_IDS || true)" == *"$TEST_PRACTICE"* ]] || die "SMC_TEST_BROKER_IDS on the VPS must list $TEST_PRACTICE first (or test leads could reach the test practice's real WhatsApp number)"
  ok "test-practice routing is set"
  local cur new; cur=$(vps_get TWILIO_CONTENT_SIDS || true); [ -n "$cur" ] || cur='{}'
  new=$(CUR="$cur" SID="$sid" node -e 'const o=JSON.parse(process.env.CUR||"{}");o.broker_lead_routed=process.env.SID;console.log(JSON.stringify(o))') || die "TWILIO_CONTENT_SIDS on the VPS is not valid JSON"
  ask "Turn W41 on now? Mark is told about Cassiem within the hour." || { warn "not switched on"; return; }
  vps_set TWILIO_CONTENT_SIDS "$new"
  vps_set SMC_BROKER_LEAD_NOTICE_ENABLED true
  "${SSH[@]}" "cd $D && ./dc up -d --force-recreate n8n" >/dev/null
  ok "on. The VPS .env backup is repo/.env.bak.<time>. To turn off: set SMC_BROKER_LEAD_NOTICE_ENABLED=false there and run ./dc up -d --force-recreate n8n"
}

case "${1:-all}" in
  all)       preflight
             ask "1. Apply the database change?" && step_db || true
             ask "2. Deploy to the VPS (W01, W03, W41)?" && step_vps || true
             ask "3. Deploy the portal?" && step_portal || true
             ask "4. Submit the WhatsApp template?" && step_template || true
             say "Done. Next: when Meta approves the template, run  bash scripts/go-live-20261024.sh switch-on" ;;
  db)        preflight; step_db ;;
  vps)       preflight; step_vps ;;
  portal)    preflight; step_portal ;;
  template)  preflight; step_template ;;
  switch-on) switch_on "${2:-}" ;;
  *)         sed -n '2,5p' "$0"; exit 2 ;;
esac
