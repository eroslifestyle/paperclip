#!/bin/bash
# Paperclip resource optimization — safe to re-run
# Riduce CPU/RAM senza perdita dati

set -e
PAPERCLIP_HOME="${PAPERCLIP_HOME:-$HOME/.paperclip}"
INSTANCE_DIR="$PAPERCLIP_HOME/instances/default"

echo "[1/5] Purge run-logs > 2 giorni..."
find "$INSTANCE_DIR/data/run-logs" -type f -mtime +2 -delete 2>/dev/null || true
find "$INSTANCE_DIR/data/run-logs" -type d -empty -delete 2>/dev/null || true

echo "[2/5] Rotate server.log se > 20MB..."
LOG="$INSTANCE_DIR/logs/server.log"
if [ -f "$LOG" ] && [ $(stat -c%s "$LOG") -gt 20971520 ]; then
  gzip -c "$LOG" > "$LOG.$(date +%Y%m%d_%H%M).gz"
  : > "$LOG"
fi

echo "[3/5] Rimuovo backup postgres > 7 giorni..."
find "$INSTANCE_DIR/data/backups" -type f -mtime +7 -delete 2>/dev/null || true

echo "[4/5] Cap Node heap (export in .bashrc se assente)..."
grep -q "NODE_OPTIONS.*max-old-space-size" "$HOME/.bashrc" || \
  echo 'export NODE_OPTIONS="--max-old-space-size=768"' >> "$HOME/.bashrc"

echo "[5/5] Disabilita telemetria a livello env..."
grep -q "PAPERCLIP_TELEMETRY_DISABLED" "$HOME/.bashrc" || \
  echo 'export PAPERCLIP_TELEMETRY_DISABLED=1' >> "$HOME/.bashrc"

echo
echo "✔ Ottimizzazione applicata."
echo "  Per attivare tuning postgres: riavvia paperclip"
echo "  Per env Node: source ~/.bashrc  (o nuova shell)"
du -sh "$INSTANCE_DIR/data/run-logs" "$INSTANCE_DIR/logs" "$INSTANCE_DIR/data/backups" 2>/dev/null
