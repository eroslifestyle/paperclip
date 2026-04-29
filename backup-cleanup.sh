#!/bin/bash
# Paperclip Backup Cleanup — keeps only the latest N backups, compresses them
set -euo pipefail

BACKUP_DIR="/home/vpshsqxf/.paperclip/instances/default/data/backups"
MAX_BACKUPS=2
LOG="/home/vpshsqxf/.paperclip/instances/default/logs/backup-cleanup.log"

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Compress any uncompressed .sql backups
for f in "$BACKUP_DIR"/paperclip-*.sql; do
  [ -f "$f" ] || continue
  [ -f "${f}.gz" ] && continue
  gzip -9 "$f"
  log "Compressed: $(basename "$f") → $(basename "$f").gz ($(du -sh "${f}.gz" | cut -f1))"
done

# Count and remove old compressed backups (keep latest MAX_BACKUPS)
count=$(ls -1t "$BACKUP_DIR"/paperclip-*.sql.gz 2>/dev/null | wc -l)
if [ "$count" -gt "$MAX_BACKUPS" ]; then
  to_remove=$((count - MAX_BACKUPS))
  removed=0
  # ls -1t sorts newest first; tail takes the oldest
  ls -1t "$BACKUP_DIR"/paperclip-*.sql.gz | tail -n "$to_remove" | while read -r old; do
    rm -f "$old"
    log "Removed: $(basename "$old")"
    removed=$((removed + 1))
  done
  log "Cleanup: removed $to_remove old backup(s), kept $MAX_BACKUPS"
else
  log "Cleanup: $count backup(s) present, no removal needed (max: $MAX_BACKUPS)"
fi

# Report disk usage
total=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "Backup dir size: $total"
