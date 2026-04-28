#!/usr/bin/env bash
#
# End-to-end Live Activity test for pushr.
#
# Walks an activity through start → two updates → end. Useful for verifying
# a fresh Widget Extension build: run it with the app in the foreground,
# then lock the phone and watch the lockscreen / Dynamic Island.
#
# Requires:
#   PUSHR_URL    HTTPS base URL of the Convex site (e.g. https://<slug>.convex.site)
#   PUSHR_TOKEN  Source app bearer token (pshr_…)
#
# Usage:
#   scripts/test-live-activity.sh                     # runs start → update → update → end
#   scripts/test-live-activity.sh start               # runs just the start step
#   scripts/test-live-activity.sh update --progress 0.7 --status "Nearly done"
#   scripts/test-live-activity.sh end
#
# The activity id is deterministic per shell session (set `ACT_ID` to override).

set -euo pipefail

: "${PUSHR_URL:?set PUSHR_URL to your Convex site URL, e.g. https://<slug>.convex.site}"
: "${PUSHR_TOKEN:?set PUSHR_TOKEN to a source-app bearer token}"

ACT_ID="${ACT_ID:-la-demo-$$}"
STEP_DELAY="${STEP_DELAY:-5}"

note() { printf '\033[36m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

send() {
  local payload="$1"
  local status http_body
  http_body=$(curl -sS -o /tmp/pushr-la-response.json -w '%{http_code}' \
    -X POST "$PUSHR_URL/notify" \
    -H "Authorization: Bearer $PUSHR_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload") || fail "curl failed"
  status="$http_body"
  if [ "$status" != "202" ]; then
    cat /tmp/pushr-la-response.json >&2
    fail "HTTP $status"
  fi
  cat /tmp/pushr-la-response.json; echo
}

# JSON builder kept inline so the script is dependency-free (no jq).
payload() {
  local action="$1" title="$2" body="$3" status="$4" progress="$5" icon="$6"
  local attributes=""
  if [ "$action" = "start" ]; then
    attributes=',"attributes":{"name":"test-runner","logoUrl":null}'
  fi
  local progress_field=""
  if [ -n "$progress" ]; then
    progress_field=",\"progress\":$progress"
  fi
  cat <<EOF
{
  "title": "$title",
  "body": "$body",
  "priority": "normal",
  "liveActivity": {
    "action": "$action",
    "activityId": "$ACT_ID"$attributes,
    "state": {
      "title": "$title",
      "status": "$status",
      "icon": "$icon"$progress_field
    }
  }
}
EOF
}

# ---- CLI parsing -----------------------------------------------------------

CMD="${1:-all}"
shift || true

STATUS="Running"
PROGRESS=""
ICON="hammer.fill"
TITLE="Deploy #42"
BODY="Live activity test"

while [ $# -gt 0 ]; do
  case "$1" in
    --status)   STATUS="$2"; shift 2 ;;
    --progress) PROGRESS="$2"; shift 2 ;;
    --icon)     ICON="$2"; shift 2 ;;
    --title)    TITLE="$2"; shift 2 ;;
    --body)     BODY="$2"; shift 2 ;;
    *) fail "unknown arg: $1" ;;
  esac
done

run_step() {
  local action="$1" status="$2" progress="$3" icon="$4"
  note "→ $action  activityId=$ACT_ID  progress=${progress:-–}  status=\"$status\""
  send "$(payload "$action" "$TITLE" "$BODY" "$status" "$progress" "$icon")"
}

case "$CMD" in
  start)
    run_step start "${STATUS:-Running tests}"     "${PROGRESS:-0.1}"  "${ICON:-hammer.fill}"
    ;;
  update)
    run_step update "$STATUS"                     "$PROGRESS"         "$ICON"
    ;;
  end)
    run_step end "${STATUS:-Complete}"            "${PROGRESS:-1.0}"  "${ICON:-checkmark.circle.fill}"
    ;;
  all)
    note "activityId=$ACT_ID  (set ACT_ID= to reuse across invocations)"
    run_step start  "Running tests"       "0.1"  "hammer.fill"
    sleep "$STEP_DELAY"
    run_step update "Building binaries"   "0.45" "hammer.fill"
    sleep "$STEP_DELAY"
    run_step update "Deploying to staging" "0.85" "paperplane.fill"
    sleep "$STEP_DELAY"
    run_step end    "Shipped"             "1.0"  "checkmark.circle.fill"
    note "done — check the lockscreen + Dynamic Island"
    ;;
  *)
    fail "unknown command: $CMD  (use: start | update | end | all)"
    ;;
esac
