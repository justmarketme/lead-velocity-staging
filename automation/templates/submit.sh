#!/usr/bin/env bash
# Submit WhatsApp message templates to Meta (POST /{WABA_ID}/message_templates).
#
# HUMAN GATE (2.2): template submission is a human gate. This script defaults to --dry-run
# and prints what it would send. Only Jonathan runs it with --submit.
#
# Usage:
#   automation/templates/submit.sh                    # dry run, all templates, core first
#   automation/templates/submit.sh --core             # dry run, the 6 core templates only
#   automation/templates/submit.sh --only reminder_2h # dry run, one template
#   automation/templates/submit.sh --submit [--core|--only NAME]   # really submit
#
# Reads from .env (repo root, or ENV_FILE=...): WABA_ID, META_SYSTEM_USER_TOKEN, META_APP_ID,
# META_GRAPH_VERSION, BOOKING_FLOW_ID / RESCHEDULE_FLOW_ID (only for *_v2 Flow-button templates),
# TEMPLATE_SAMPLE_DIR (sample header media for review; default automation/templates/samples).
#
# Placeholders inside the JSON files that this script resolves at submit time:
#   __UPLOAD_HANDLE__:<file>  -> header_handle from the Resumable Upload API (POST /{app_id}/uploads)
#   __BOOKING_FLOW_ID__       -> $BOOKING_FLOW_ID    (broker_intro_slots_v2; skipped if unset)
#   __RESCHEDULE_FLOW_ID__    -> $RESCHEDULE_FLOW_ID (reschedule_offer_v2; skipped if unset)
#
# Idempotent: Meta rejects a duplicate name+language, so a re-run only re-tries what failed.
# Backoff: one retry per template on HTTP 429/5xx after 30 s; never loops (no retry storms).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
MODE="dry-run"
FILTER="all"
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --submit) MODE="submit" ;;
    --dry-run) MODE="dry-run" ;;
    --core) FILTER="core" ;;
    --only) FILTER="only"; ONLY="${2:?--only needs a template name}"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }

if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

GRAPH="https://graph.facebook.com/${META_GRAPH_VERSION:-v23.0}"
SAMPLES="${TEMPLATE_SAMPLE_DIR:-$HERE/samples}"

# Submit order: the 6 core templates first (0.3 #1, 4.6 template strategy), then the rest.
CORE=(broker_intro_booked broker_intro_slots booking_confirmed reminder_24h reminder_2h missed_you)
REST=(
  reminder_10m what_to_expect reschedule_offer attended_thanks prep_nudge intro_media intro_media_voice
  unbooked_nudge_2h unbooked_nudge_24h unbooked_nudge_24h_text unbooked_nudge_72h reach_check lead_pulse
  broker_new_booking broker_outcome_check broker_disposition broker_quality broker_feedback_thanks
  broker_daily_digest precall_brief broker_weekly broker_midcycle broker_cycle_end
  ops_pulse ops_action ops_alert ops_weekly ops_gate
  broker_intro_slots_v2 reschedule_offer_v2
)

case "$FILTER" in
  core) LIST=("${CORE[@]}") ;;
  only) LIST=("$ONLY") ;;
  *)    LIST=("${CORE[@]}" "${REST[@]}") ;;
esac

if [[ "$MODE" == "submit" ]]; then
  : "${WABA_ID:?WABA_ID missing in .env}"
  : "${META_SYSTEM_USER_TOKEN:?META_SYSTEM_USER_TOKEN missing in .env}"
fi

upload_handle() { # $1 = sample file name -> prints header_handle
  local f="$SAMPLES/$1"
  if [[ "$MODE" == "dry-run" ]]; then echo "DRYRUN_HANDLE_FOR_$1"; return; fi
  [[ -f "$f" ]] || { echo "missing sample media: $f" >&2; return 1; }
  : "${META_APP_ID:?META_APP_ID missing in .env (needed for header media upload)}"
  local len type sess
  len=$(wc -c <"$f" | tr -d ' ')
  case "$f" in *.png) type=image/png ;; *.jpg|*.jpeg) type=image/jpeg ;; *.mp4) type=video/mp4 ;; *) echo "bad media type $f" >&2; return 1 ;; esac
  sess=$(curl -sS -X POST "$GRAPH/$META_APP_ID/uploads?file_length=$len&file_type=$type" \
    -H "Authorization: Bearer $META_SYSTEM_USER_TOKEN" | jq -r '.id')
  curl -sS -X POST "$GRAPH/$sess" -H "Authorization: OAuth $META_SYSTEM_USER_TOKEN" \
    -H "file_offset: 0" --data-binary @"$f" | jq -r '.h'
}

resolve() { # $1 = json file -> resolved JSON on stdout
  local json handle_file h
  json=$(cat "$1")
  while handle_file=$(grep -o '__UPLOAD_HANDLE__:[A-Za-z0-9_.-]*' <<<"$json" | head -n1) && [[ -n "$handle_file" ]]; do
    h=$(upload_handle "${handle_file#__UPLOAD_HANDLE__:}")
    json=${json//"$handle_file"/"$h"}
  done
  if grep -q '__BOOKING_FLOW_ID__' <<<"$json"; then
    [[ -n "${BOOKING_FLOW_ID:-}" ]] || return 3
    json=${json//__BOOKING_FLOW_ID__/$BOOKING_FLOW_ID}
  fi
  if grep -q '__RESCHEDULE_FLOW_ID__' <<<"$json"; then
    [[ -n "${RESCHEDULE_FLOW_ID:-}" ]] || return 3
    json=${json//__RESCHEDULE_FLOW_ID__/$RESCHEDULE_FLOW_ID}
  fi
  jq -c . <<<"$json"
}

post() { # $1 = name, $2 = body -> prints status line
  local resp code
  for attempt in 1 2; do
    resp=$(curl -sS -w '\n%{http_code}' -X POST "$GRAPH/$WABA_ID/message_templates" \
      -H "Authorization: Bearer $META_SYSTEM_USER_TOKEN" -H "Content-Type: application/json" -d "$2")
    code=$(tail -n1 <<<"$resp"); resp=$(sed '$d' <<<"$resp")
    if [[ "$code" == 429 || "$code" =~ ^5 ]] && [[ $attempt == 1 ]]; then sleep 30; continue; fi
    break
  done
  echo "$1 HTTP $code $(jq -c '{id, status, category, error: .error.message}' <<<"$resp" 2>/dev/null || echo "$resp")"
}

echo "mode=$MODE filter=$FILTER graph=$GRAPH count=${#LIST[@]}"
for name in "${LIST[@]}"; do
  file="$HERE/$name.json"
  [[ -f "$file" ]] || { echo "SKIP $name (no file)"; continue; }
  set +e; body=$(resolve "$file"); rc=$?; set -e
  if [[ $rc == 3 ]]; then echo "SKIP $name (flow id not set; submit after the Flow is published)"; continue; fi
  [[ $rc == 0 ]] || { echo "FAIL $name (resolve error)"; continue; }
  if [[ "$MODE" == "dry-run" ]]; then
    echo "DRY  POST $GRAPH/\${WABA_ID}/message_templates  $name"
    jq . <<<"$body"
  else
    post "$name" "$body"
  fi
done
echo "Done. Category decisions: accept Meta's decision (0.3 #1); log each id/status/category in the console."
