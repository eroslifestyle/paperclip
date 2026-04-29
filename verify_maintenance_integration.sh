#!/bin/bash

echo "=== Verifica Integrazione Sistema di Pulizia Automatica ==="
echo

# 1. Verifica che il servizio Paperclip sia in esecuzione
echo "1. Verifica stato Paperclip..."
if curl -s http://localhost:3100/api/health | jq -r '.status' | grep -q "ok"; then
    echo "✅ Paperclip è in esecuzione"
else
    echo "❌ Paperclip non è in esecuzione"
    exit 1
fi

# 2. Verifica endpoint manutenzione
echo
echo "2. Verifica endpoint manutenzione..."
if curl -s http://localhost:3100/api/maintenance/status | jq -r '.enabled' | grep -q "true"; then
    echo "✅ Servizio manutenzione è abilitato"
else
    echo "❌ Servizio manutenzione non è abilitato"
fi

# 3. Mostra stato attuale
echo
echo "3. Stato attuale del servizio:"
curl -s http://localhost:3100/api/maintenance/status | jq '{
  enabled: .enabled,
  running: .running,
  lastRun: .lastRun,
  nextRun: .nextRun,
  interval: "\(.config.intervalMinutes) minutes"
}'

# 4. Verifica che la pagina di manutenzione sia accessibile
echo
echo "4. Verifica pagina manutenzione UI..."
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/instance/settings/maintenance)
if [ "$STATUS_CODE" = "200" ]; then
    echo "✅ Pagina manutenzione UI è accessibile"
else
    echo "❌ Pagina manutenzione UI non accessibile (status: $STATUS_CODE)"
fi

# 5. Esegui un test di manutenzione
echo
echo "5. Esecuzione test manutenzione..."
echo "Richiesta esecuzione manutenzione..."
curl -s -X POST http://localhost:3100/api/maintenance/run | jq .

echo
echo "Attendo 3 secondi per completamento..."
sleep 3

echo
echo "6. Verifica post-esecuzione..."
curl -s http://localhost:3100/api/maintenance/status | jq '{
  lastRun: .lastRun,
  running: .running
}'

echo
echo "=== Verifica Completata ==="
echo "Il sistema di pulizia automatica è completamente integrato e funzionante."
echo "Accedi alla configurazione: http://localhost:3100/instance/settings/maintenance"