#!/bin/bash
# Cleanup script for encoding issues
# Removes temporary files that might cause UTF-8 encoding errors

echo "=== Cleaning up potential encoding issues ==="

# Clean up zai slot files that might be corrupted
echo "Cleaning ZAI slot files..."
rm -rf /tmp/zai-slots/* 2>/dev/null || true
mkdir -p /tmp/zai-slots 2>/dev/null || true
chmod 777 /tmp/zai-slots 2>/dev/null || true

# Clean up any temporary files with null bytes in common locations
echo "Cleaning temporary files..."
find /tmp -name "*.tmp" -type f -delete 2>/dev/null || true
find /tmp -name "*encoding*" -type f -delete 2>/dev/null || true

# Check and clean PostgreSQL temporary files if any
echo "Checking PostgreSQL temp files..."
find /tmp -name "pgsql_tmp*" -type f -exec rm -f {} \; 2>/dev/null || true

# Rotate server log if it's too large and might contain binary data
SERVER_LOG="/home/vpshsqxf/.paperclip/instances/default/logs/server.log"
if [ -f "$SERVER_LOG" ] && [ $(stat -c%s "$SERVER_LOG" 2>/dev/null || echo 0) -gt 10485760 ]; then
    echo "Rotating server log (larger than 10MB)..."
    mv "$SERVER_LOG" "${SERVER_LOG}.$(date +%Y%m%d_%H%M%S).old" 2>/dev/null || true
    touch "$SERVER_LOG" 2>/dev/null || true
fi

echo "=== Cleanup completed ==="
echo "System should be ready to continue."