#!/bin/bash
# Paperclip launcher ottimizzato — env vars corrette
# Uso: ./start-optimized.sh         (foreground)
#      ./start-optimized.sh bg      (background + disown)

export HEARTBEAT_SCHEDULER_INTERVAL_MS=60000
export PAPERCLIP_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=3072"
export PAPERCLIP_HOME="${PAPERCLIP_HOME:-$HOME/.paperclip}"
export PAPERCLIP_INSTANCE_ID="${PAPERCLIP_INSTANCE_ID:-default}"

LOG="$PAPERCLIP_HOME/instances/default/logs/server.log"

if [ "$1" = "bg" ]; then
  nohup paperclipai run >> "$LOG" 2>&1 < /dev/null &
  disown
  sleep 5
  PID=$(pgrep -f "paperclipai run" | head -1)
  echo "paperclipai started PID=$PID"
  echo "Env check:"
  tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep -E "HEARTBEAT|TELEMETRY|NODE_OPTIONS"
else
  exec paperclipai run
fi
