#!/bin/bash
echo "🚀 Paperclip ottimizzato"

# Limita RAM Node.js
export NODE_OPTIONS="--max-old-space-size=4096"

# Se hai postgres esterno, aggiungi:
export PGPOOL_MAX_CONNECTIONS=5

# Avvia paperclipai
paperclipai run --config cpu-limit=true --connection-pool-size=5