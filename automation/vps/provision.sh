#!/usr/bin/env bash
# provision.sh: W26 steps 2..13, from a bought Hostinger KVM 2 ("Ubuntu 24.04 with n8n" template) to `ready_for_go_live`.
# Runs on the OPERATOR machine (Jonathan's laptop, bash/WSL/Git Bash), driving the VPS over SSH. Nothing is bought here:
# the purchase is the one human gate (W26.md). Default is a DRY RUN that prints the plan; pass --apply to execute.
#   VPS_HOST=<ip> automation/vps/provision.sh                 # dry run: print every step
#   VPS_HOST=<ip> automation/vps/provision.sh --apply         # execute all steps (each step is idempotent)
#   ... --apply --from 8                                      # resume after a halt (e.g. waiting on DNS)
#   ... --apply --only 11                                     # re-run one step (e.g. re-point webhooks)
#   ... --apply --force-n8n-restore                           # allow step 7 to overwrite n8n on a VPS that already has it
# Reads the repo-root .env (git-ignored). Never prints secret values. Halts on the first failing step and says which.
set -Eeuo pipefail
umask 077
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENVF="${PROVISION_ENV_FILE:-$REPO/.env}"
APPLY=""; FROM=1; ONLY=""; FORCE7=""
while [[ $# -gt 0 ]]; do case "$1" in
  --apply) APPLY=1 ;; --from) FROM="$2"; shift ;; --only) ONLY="$2"; shift ;; --force-n8n-restore) FORCE7=1 ;;
  -h|--help) sed -n '2,12p' "$0"; exit 0 ;; *) echo "unknown arg: $1"; exit 2 ;; esac; shift; done
[[ -f "$ENVF" ]] || { echo "missing $ENVF"; exit 2; }
set -a; . "$ENVF"; set +a
: "${VPS_HOST:?set VPS_HOST (the new VPS IP)}"
VPS_SSH_USER="${VPS_SSH_USER:-root}"
API_HOST="${API_HOST:-api.leadvelocity.co.za}"; N8N_UI_HOST="${N8N_UI_HOST:-n8n.leadvelocity.co.za}"
DOMAIN="${LV_DOMAIN:-leadvelocity.co.za}"
GV="${META_GRAPH_VERSION:-v23.0}"
REMOTE_DIR=/opt/lead-velocity
DC="cd $REMOTE_DIR && docker compose --env-file $REMOTE_DIR/.env -p lv -f automation/docker-compose.yml -f automation/vps/traefik/docker-compose.traefik.yml"
LOCAL_DC=(docker compose -f "$REPO/automation/docker-compose.yml")
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new ${VPS_SSH_KEY_PATH:+-i "$VPS_SSH_KEY_PATH"} "$VPS_SSH_USER@$VPS_HOST")
STEP=0; STEP_NAME=""; T0=$(date +%s)
say() { printf '[%s +%ss] step %s %s: %s\n' "$(date +%H:%M:%S)" "$(( $(date +%s) - T0 ))" "$STEP" "$STEP_NAME" "$*"; }
remote() { "${SSH[@]}" "$@"; }
mark() { remote "mkdir -p /var/lib/lv/provision && date -u +%FT%TZ > /var/lib/lv/provision/$(printf %02d "$STEP").done"; }
poll() { # seconds cmd...
  local t="$1"; shift; local end=$(( $(date +%s) + t ))
  until "$@" >/dev/null 2>&1; do [[ $(date +%s) -lt $end ]] || return 1; sleep 15; done; }
notify() { # best-effort status to the LOCAL n8n (W26 relays to W22); signed server-to-server with INTERNAL_HMAC_SECRET
  [[ -n "${INTERNAL_HMAC_SECRET:-}" ]] || return 0
  local body ts sig; ts=$(date +%s); body="{\"step\":$STEP,\"name\":\"$STEP_NAME\",\"ok\":$1,\"vps\":\"$VPS_HOST\"}"
  sig=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$INTERNAL_HMAC_SECRET" -r | cut -d' ' -f1)
  curl -fsS -m 10 -X POST "${2:-${LOCAL_N8N_URL:-http://localhost:5678}}/webhook/w26/status" -H 'Content-Type: application/json' \
    -H "X-LV-Timestamp: $ts" -H "X-LV-Signature: sha256=$sig" -d "$body" -o /dev/null || true; }
trap 'say "HALT: failed (line $LINENO). Nothing was unpaused. Fix, then: provision.sh --apply --from $STEP"; notify false; exit 1' ERR

step() { # n name fn
  STEP="$1"; STEP_NAME="$2"
  if [[ -n "$ONLY" && "$ONLY" != "$1" ]] || [[ -z "$ONLY" && "$1" -lt "$FROM" ]]; then return 0; fi
  if [[ -z "$APPLY" ]]; then say "PLAN: $(grep -m1 "^$3() {" "$0" | sed 's/^[^#]*# *//')"; return 0; fi
  say "start"; "$3"; mark; say "done"
}

# 1. Preflight
s1() { # Check local .env names, SSH key login, local n8n, clean git tree (code is shipped from HEAD)
  for v in N8N_ENCRYPTION_KEY TRAEFIK_ACME_EMAIL META_APP_ID META_APP_SECRET META_WEBHOOK_VERIFY_TOKEN POSTGRES_USER POSTGRES_DB; do
    [[ -n "${!v:-}" ]] || { say "missing $v in .env"; return 1; }; done
  remote true
  git -C "$REPO" diff --quiet HEAD -- automation || say "WARN: uncommitted changes under automation/ are NOT shipped (git archive HEAD)"
  "${LOCAL_DC[@]}" ps --status running n8n >/dev/null 2>&1 || say "WARN: local n8n not running; step 7 needs N8N_BACKUP_FILE + AGE_KEY_FILE"
}
# 2. Base hardening
s2() { # apt age/curl, unattended upgrades, ufw 22/80/443, SSH keys only (we are connected by key, so this is safe)
  remote 'set -e; export DEBIAN_FRONTEND=noninteractive; apt-get update -qq; apt-get install -y -qq age curl ca-certificates ufw unattended-upgrades >/dev/null
    ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
    f=/etc/ssh/sshd_config.d/10-lv.conf; printf "PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n" > $f
    sshd -t
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
    dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
    timedatectl set-timezone UTC'
}
# 3. Retire the template's stack (it owns 80/443); our stack is project "lv"
s3() { # docker compose down every compose project except lv (volumes kept), free ports 80/443
  remote 'set -e; for p in $(docker compose ls -a --format json | python3 -c "import sys,json;[print(x[\"Name\"]) for x in json.load(sys.stdin)]"); do
      [ "$p" = lv ] || docker compose -p "$p" down; done
    for c in $(docker ps --format "{{.ID}} {{.Ports}}" | grep -E ":(80|443)->" | grep -v -- "-lv-\|lv-traefik" | cut -d" " -f1); do docker stop "$c"; done'
}
# 4. Ship code (no git credentials on the VPS: tar of committed HEAD over SSH)
s4() { # git archive HEAD automation/ | ssh tar -x into /opt/lead-velocity
  remote "mkdir -p $REMOTE_DIR"
  git -C "$REPO" archive --format=tar HEAD automation | remote "tar -x -C $REMOTE_DIR"
}
# 5. Ship .env (0600) with production overrides; service-role key stays on the laptop
s5() { # write /opt/lead-velocity/.env and /etc/lv/backup.env over SSH, mode 0600
  local tmp; tmp="$(mktemp)"; trap 'rm -f "$tmp"' RETURN
  grep -vE '^(SUPABASE_SERVICE_ROLE_KEY|BACKUP_S3_READ_|AGE_KEY_FILE|N8N_PUBLIC_URL|WEBHOOK_URL|N8N_HOST|N8N_PROTOCOL|NODE_ENV|API_HOST|N8N_UI_HOST|DRY_RUN_SENDS)=' "$ENVF" > "$tmp"
  printf 'NODE_ENV=production\nN8N_PUBLIC_URL=https://%s\nWEBHOOK_URL=https://%s/\nN8N_HOST=%s\nN8N_PROTOCOL=https\nAPI_HOST=%s\nN8N_UI_HOST=%s\nDRY_RUN_SENDS=false\n' \
    "$API_HOST" "$API_HOST" "$N8N_UI_HOST" "$API_HOST" "$N8N_UI_HOST" >> "$tmp"
  remote "umask 077; cat > $REMOTE_DIR/.env" < "$tmp"
  grep -E '^(BACKUP_|OPS_PING_URL=)' "$ENVF" | grep -vE '^BACKUP_S3_READ_' > "$tmp" || true
  remote "umask 077; mkdir -p /etc/lv && cat > /etc/lv/backup.env" < "$tmp"
}
# 6. Start n8n + Postgres + Traefik
s6() { # docker compose up -d (pinned images), wait for n8n /healthz on the VPS loopback
  remote "$DC pull -q && $DC up -d"
  poll 300 remote 'curl -fsS http://127.0.0.1:5678/healthz'
}
# 7. Restore n8n state (workflows, credentials encrypted by the same N8N_ENCRYPTION_KEY, users, API keys)
s7() { # stream local n8n DB (or a decrypted backup) into the VPS n8n Postgres; guarded against overwriting production
  if [[ -z "$FORCE7" ]] && remote 'test -f /var/lib/lv/provision/07.done'; then say "already restored once; skipping (use --force-n8n-restore)"; return 0; fi
  remote "$DC stop n8n"
  if [[ -n "${N8N_BACKUP_FILE:-}" ]]; then
    age -d -i "${AGE_KEY_FILE:?set AGE_KEY_FILE}" "$N8N_BACKUP_FILE" \
      | remote "$DC exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"
  else
    "${LOCAL_DC[@]}" exec -T postgres sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' \
      | remote "$DC exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'"
  fi
  remote "$DC start n8n"
  poll 180 remote 'curl -fsS http://127.0.0.1:5678/healthz'
}
# 8. DNS at GoDaddy: api. and n8n. A records -> VPS IP (and LINK_HOST if set)
s8() { # GoDaddy API if GODADDY_API_KEY/SECRET are set, else print the records (Chrome agent / Jonathan) and poll dns.google
  local hosts=("api" "n8n")
  for h in "${hosts[@]}"; do
    if [[ -n "${GODADDY_API_KEY:-}" && -n "${GODADDY_API_SECRET:-}" ]]; then
      curl -fsS -X PUT "https://api.godaddy.com/v1/domains/$DOMAIN/records/A/$h" -H "Authorization: sso-key $GODADDY_API_KEY:$GODADDY_API_SECRET" \
        -H 'Content-Type: application/json' -d "[{\"data\":\"$VPS_HOST\",\"ttl\":600}]" -o /dev/null
    else say "ACTION (GoDaddy DNS, see automation/dns/DNS.md section 3): A  $h.$DOMAIN  ->  $VPS_HOST  TTL 600"; fi
  done
  [[ -n "${LINK_HOST:-}" ]] && say "ACTION: A  $LINK_HOST  ->  $VPS_HOST  TTL 600 (at the sortmycover.co.za DNS host)"
  resolves() { curl -fsS "https://dns.google/resolve?name=$1&type=A" | grep -q "\"data\":\"$VPS_HOST\""; }
  poll 1800 resolves "$API_HOST" || { say "api. not resolving to $VPS_HOST after 30 min"; return 1; }
  poll 600 resolves "$N8N_UI_HOST" || say "WARN: n8n. not resolving yet (editor only; not blocking)"
}
# 9. TLS: Traefik obtains Let's Encrypt certs on first request
s9() { # poll https://API_HOST/healthz with full certificate validation
  poll 600 curl -fsS -m 10 "https://$API_HOST/healthz"
  curl -sS -o /dev/null -w '%{http_code}' "https://$API_HOST/rest/settings" | grep -qE '^(404|403)$' || { say "editor API reachable on api. host; check Traefik rule"; return 1; }
}
# 10. Backups on: cron + first run
s10() { # install /etc/cron.d/lv-backup, selftest the encryption, run one nightly backup now
  remote "install -m 0644 $REMOTE_DIR/automation/backup/cron.lv-backup /etc/cron.d/lv-backup && chmod 0755 $REMOTE_DIR/automation/backup/*.sh"
  remote "$REMOTE_DIR/automation/backup/pg_dump_nightly.sh --selftest"
  remote "LV_COMPOSE_DIR=$REMOTE_DIR $REMOTE_DIR/automation/backup/pg_dump_nightly.sh"
}
# 11. Re-point webhooks from the tunnel URL to https://API_HOST
s11() { # Meta app subscriptions (WABA, page, instagram), Flow endpoint_uri; print the Paystack + uptime-monitor actions
  local app_token="$META_APP_ID|$META_APP_SECRET"
  sub() { curl -fsS -X POST "https://graph.facebook.com/$GV/$META_APP_ID/subscriptions" --data-urlencode "access_token=$app_token" \
      --data-urlencode "object=$1" --data-urlencode "callback_url=https://$API_HOST/webhook/$2" \
      --data-urlencode "verify_token=$META_WEBHOOK_VERIFY_TOKEN" --data-urlencode "fields=$3" --data-urlencode "include_values=true" -o /dev/null; }
  sub whatsapp_business_account wa "messages,message_template_status_update,phone_number_quality_update,account_update"
  sub page meta-page "leadgen,feed,messages"
  [[ -n "${IG_USER_ID:-}" ]] && sub instagram meta-ig "comments,messages"
  if [[ -n "${BOOKING_FLOW_ID:-}" && -n "${FLOW_ENDPOINT_URL:-}" ]]; then
    for f in "$BOOKING_FLOW_ID" ${RESCHEDULE_FLOW_ID:-}; do
      curl -fsS -X POST "https://graph.facebook.com/$GV/$f" -H "Authorization: Bearer $META_SYSTEM_USER_TOKEN" \
        --data-urlencode "endpoint_uri=$FLOW_ENDPOINT_URL" -o /dev/null; done
  fi
  say "ACTION (Chrome agent): Paystack dashboard > Settings > API Keys & Webhooks > Live webhook URL = https://$API_HOST/webhook/paystack"
  say "ACTION: uptime monitor (automation/vps/UPTIME.md) > monitors on https://$API_HOST/healthz, callback https://$API_HOST/webhook/w22/uptime"
}
# 12. Synthetic suite against production URLs (Phase 5 rule: only end-to-end counts)
s12() { # node --test 'automation/tests/*.test.mjs' with N8N_PUBLIC_URL=https://API_HOST and TEST_TARGET=production
  ( cd "$REPO" && N8N_PUBLIC_URL="https://$API_HOST" TEST_TARGET=production node --test 'automation/tests/*.test.mjs' )
}
# 13. Ready: tell W26 on the VPS; W26 sets brokers.status = ready_for_go_live and WhatsApps Jonathan
s13() { # signed POST https://API_HOST/webhook/w26/status {ok:true}; nothing is unpaused (Go live stays a human tap)
  notify true "https://$API_HOST"
  say "PROVISIONED in $(( ($(date +%s) - T0) / 60 )) min. Go live remains Jonathan's tap in the console."
}

[[ -z "$APPLY" ]] && echo "DRY RUN (no changes). Plan for VPS $VPS_HOST, api=$API_HOST, editor=$N8N_UI_HOST:"
step 1 "preflight" s1;  step 2 "harden" s2;  step 3 "retire-template" s3;  step 4 "ship-code" s4
step 5 "ship-env" s5;   step 6 "compose-up" s6; step 7 "restore-n8n" s7;  step 8 "dns" s8
step 9 "tls" s9;        step 10 "backups" s10;  step 11 "webhooks" s11;   step 12 "synthetic-suite" s12
step 13 "ready" s13
