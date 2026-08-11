#!/bin/bash
# Session time tracker for SR&ED logging
# Usage: ./scripts/session-log.sh start   # records start timestamp
#        ./scripts/session-log.sh end     # records end timestamp, prints summary

LOG_DIR="${LEXSORT_DIR_OVERRIDE:-$HOME/.lexsort}/session-log"
mkdir -p "$LOG_DIR"

SESSION_FILE="$LOG_DIR/current.json"

if [ "$1" = "start" ]; then
  if [ -f "$SESSION_FILE" ]; then
    echo "WARNING: Session already active since $(jq -r '.start_time' "$SESSION_FILE")"
    echo "Run './scripts/session-log.sh end' first to close it."
    exit 1
  fi
  cat > "$SESSION_FILE" <<EOF
{
  "start_iso": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "start_local": "$(date +%Y-%m-%d %H:%M)",
  "start_epoch": $(date +%s)
}
EOF
  echo "Session started at $(date +%Y-%m-%d %H:%M)"
  echo "Saved to $SESSION_FILE"

elif [ "$1" = "end" ]; then
  if [ ! -f "$SESSION_FILE" ]; then
    echo "No active session found. Start one first: ./scripts/session-log.sh start"
    exit 1
  fi
  START_EPOCH=$(jq -r '.start_epoch' "$SESSION_FILE")
  START_LOCAL=$(jq -r '.start_local' "$SESSION_FILE")
  NOW_EPOCH=$(date +%s)
  NOW_LOCAL=$(date +%Y-%m-%d %H:%M)
  ELAPSED_SEC=$((NOW_EPOCH - START_EPOCH))
  ELAPSED_HOURS=$(echo "scale=2; $ELAPSED_SEC / 3600" | bc)

  cat > "$SESSION_FILE" <<EOF
{
  "start_iso": "$(jq -r '.start_iso' "$SESSION_FILE")",
  "start_local": "$START_LOCAL",
  "start_epoch": $START_EPOCH,
  "end_iso": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "end_local": "$NOW_LOCAL",
  "end_epoch": $NOW_EPOCH,
  "elapsed_hours": $ELAPSED_HOURS
}
EOF

  echo "========================================"
  echo " Session ended at $NOW_LOCAL"
  echo " Started at      $START_LOCAL"
  echo " Duration:       ${ELAPSED_HOURS}h (${ELAPSED_SEC}s)"
  echo "========================================"
  echo ""
  echo "SR&ED entry saved to $SESSION_FILE"
  echo "Use these values when logging your SR&ED entry."

else
  echo "Usage: $0 {start|end}"
  echo ""
  echo "  start   Begin a new work session (records timestamp)"
  echo "  end     End current session (prints duration)"
  exit 1
fi
