#!/bin/bash

# Script per avviare Paperclip con il sistema di manutenzione integrato

echo "=== Avvio Paperclip con Sistema di Pulizia Automatica ==="
echo

# Directory corrente
cd /home/vpshsqxf/.paperclip

# Carica il modulo di manutenzione
echo "Caricamento modulo manutenzione..."
node -e "
const { MaintenanceService } = require('./maintenance-extension.js');

// Crea istanza del servizio
const maintenance = new MaintenanceService();

// Avvia il servizio
maintenance.start();

// Log dello stato iniziale
console.log('Maintenance service started with status:', JSON.stringify(maintenance.getStatus(), null, 2));

// Mantieni il processo in esecuzione
console.log('Maintenance service is running...');
console.log('Press Ctrl+C to stop');

// Gestisci l'arresto
process.on('SIGTERM', () => {
  console.log('Stopping maintenance service...');
  maintenance.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Stopping maintenance service...');
  maintenance.stop();
  process.exit(0);
});
" &
MAINTENANCE_PID=$!

echo "Servizio manutenzione avviato (PID: $MAINTENANCE_PID)"

# Avvia Paperclip
echo "Avvio Paperclip..."
nohup paperclipai run > paperclip.log 2>&1 &
PAPERCLIP_PID=$!

echo "Paperclip avviato (PID: $PAPERCLIP_PID)"
echo
echo "Per verificare lo stato:"
echo "1. Controllare i log: tail -f paperclip.log"
echo "2. Accedere a: http://localhost:3100"
echo "3. Endpoints di manutenzione non sono disponibili in questa configurazione"
echo
echo "Per fermare i servizi:"
echo "kill $PAPERCLIP_PID $MAINTENANCE_PID"

# Mantieni lo script in esecuzione
wait