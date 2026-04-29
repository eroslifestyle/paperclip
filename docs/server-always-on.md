---
title: Server Sempre Attivo - Configurazione Systemd e Sincronizzazione
version: 1.0.0
date: 2026-04-14
---

# Server Sempre Attivo - Systemd Service + Sync Chrome

Guida per configurare Paperclip come servizio systemd sempre attivo, evitando incongruenze e perdite di sincronia tra server e UI su Chrome.

## Problema

Senza un servizio persistente:
- Il server Paperclip si ferma alla chiusura del terminale
- La UI su Chrome perde la connessione WebSocket/SSE
- Gli agenti in esecuzione vengono interrotti
- I task in corso non completano
- Stato UI/server disallineato dopo reboot
- Heartbeat agenti persi → task bloccati

## Soluzione: Systemd Service

### 1. Creazione Service File

Crea `/etc/systemd/system/paperclip.service`:

```ini
[Unit]
Description=Paperclip AI Agent Platform
Documentation=https://github.com/paperclipai/paperclip
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vpshsqxf
Group=vpshsqxf
WorkingDirectory=/home/vpshsqxf/.paperclip/sviluppo

# Environment
Environment="NODE_ENV=production"
Environment="PAPERCLIP_HOME=/home/vpshsqxf/.paperclip"
Environment="PAPERCLIP_INSTANCE_ID=default"
Environment="PATH=/usr/local/bin:/usr/bin:/bin:/home/vpshsqxf/.nvm/versions/node/v20.11.0/bin"
EnvironmentFile=-/home/vpshsqxf/.paperclip/instances/default/.env

# Start command
ExecStart=/usr/bin/pnpm --filter @paperclipai/server exec tsx ../scripts/dev-runner.ts dev

# Restart policy
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Graceful shutdown
TimeoutStopSec=30
KillMode=mixed
KillSignal=SIGTERM

# Logging
StandardOutput=append:/home/vpshsqxf/.paperclip/instances/default/logs/systemd.log
StandardError=append:/home/vpshsqxf/.paperclip/instances/default/logs/systemd-error.log

# Security
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=false
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 2. Enable & Start

```bash
# Ricarica configurazione systemd
sudo systemctl daemon-reload

# Abilita avvio al boot
sudo systemctl enable paperclip.service

# Avvia il servizio
sudo systemctl start paperclip.service

# Verifica status
sudo systemctl status paperclip.service

# Visualizza log in tempo reale
sudo journalctl -u paperclip -f
```

### 3. Comandi di Gestione

```bash
# Stop
sudo systemctl stop paperclip

# Restart
sudo systemctl restart paperclip

# Reload config senza restart
sudo systemctl reload paperclip

# Disable avvio boot
sudo systemctl disable paperclip

# Log ultimi 100 righe
sudo journalctl -u paperclip -n 100

# Log da data specifica
sudo journalctl -u paperclip --since "2026-04-14 08:00"
```

## Sincronizzazione Chrome ↔ Server

### Problema Disconnessione UI

Chrome può perdere sincronia con il server per:
- Tab inattiva (browser throttling)
- Connessione WebSocket scaduta
- Server restart durante sessione attiva
- Cache browser obsoleta
- Service Worker disallineato

### Configurazioni Necessarie

#### 1. Keep-Alive WebSocket

Aggiungi in `/home/vpshsqxf/.paperclip/instances/default/config.json`:

```json
{
  "server": {
    "keepAlive": {
      "enabled": true,
      "interval": 30000,
      "timeout": 120000
    },
    "websocket": {
      "pingInterval": 25000,
      "pingTimeout": 60000,
      "maxReconnectAttempts": 10,
      "reconnectBackoff": "exponential"
    }
  }
}
```

#### 2. Session Persistence

```json
{
  "session": {
    "persistent": true,
    "storage": "database",
    "ttlHours": 24,
    "resumeOnReconnect": true,
    "syncOnFocus": true
  }
}
```

#### 3. Chrome Flags Consigliate

In Chrome URL bar: `chrome://flags/`

Abilita:
- **Tab Freeze**: DISABLED (evita sospensione tab)
- **Calculate window occlusion**: DISABLED
- **Back-forward cache**: ENABLED

#### 4. Chrome Settings

In `chrome://settings/`:
- **On startup**: Continue where you left off
- **Privacy**: Preload pages → Standard preloading
- **Performance**: Memory Saver → OFF for paperclip tab
- **Site Settings** → `localhost:3100` → Always allow

### 5. Chrome Extension per Tab Keep-Alive

Installa **"Tab Wrangler"** o **"Auto Tab Discard (whitelist)"**:
- Whitelist: `http://localhost:3100/*`
- Disabilita discarding per paperclip

Oppure usa bookmark JavaScript:
```javascript
javascript:(function(){setInterval(()=>{fetch('/api/health').catch(()=>{})},30000)})()
```

## Heartbeat & Sync Protocol

### Client-Side Heartbeat (UI)

```javascript
// Aggiungere in ui/src/lib/heartbeat.ts
class ClientHeartbeat {
  private interval = 30000;
  private timer: NodeJS.Timer | null = null;
  private lastSync = Date.now();

  start() {
    this.timer = setInterval(() => this.ping(), this.interval);
    window.addEventListener('focus', () => this.resync());
    window.addEventListener('online', () => this.resync());
  }

  async ping() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) this.resync();
    } catch {
      this.resync();
    }
  }

  async resync() {
    const diff = Date.now() - this.lastSync;
    if (diff > 60000) {
      await this.fullSync();
    }
    this.lastSync = Date.now();
  }

  async fullSync() {
    await queryClient.invalidateQueries();
  }
}
```

### Server-Side Agent Heartbeat

Configurato in `config.json`:
```json
{
  "agents": {
    "heartbeat": {
      "interval": 60000,
      "timeout": 300000,
      "graceTimeMs": 120000
    },
    "recovery": {
      "enabled": true,
      "maxRetries": 3,
      "resumeOrphaned": true
    }
  }
}
```

## Monitoring & Alerting

### Health Check Endpoint

```bash
# Simple check
curl http://localhost:3100/api/health

# Detailed check con metriche
curl http://localhost:3100/api/health/detailed
```

### Script Monitor Esterno

Crea `/home/vpshsqxf/.paperclip/scripts/monitor-health.sh`:

```bash
#!/bin/bash
# Monitor Paperclip health ogni minuto

LOG=/home/vpshsqxf/.paperclip/instances/default/logs/monitor.log
URL=http://localhost:3100/api/health

while true; do
  TIMESTAMP=$(date -Iseconds)
  if ! curl -sf -m 5 $URL > /dev/null; then
    echo "[$TIMESTAMP] HEALTH CHECK FAILED - Restarting..." >> $LOG
    sudo systemctl restart paperclip
    sleep 30
  fi
  sleep 60
done
```

Aggiungi a systemd come `/etc/systemd/system/paperclip-monitor.service`:

```ini
[Unit]
Description=Paperclip Health Monitor
After=paperclip.service

[Service]
Type=simple
User=vpshsqxf
ExecStart=/home/vpshsqxf/.paperclip/scripts/monitor-health.sh
Restart=always

[Install]
WantedBy=multi-user.target
```

### Alerting via Email/Slack

```bash
# Esempio notifica Slack su failure
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Paperclip down on '$(hostname)'"}' \
  $SLACK_WEBHOOK_URL
```

## Backup Automatico Prima di Restart

### Pre-Restart Hook

Aggiungi in `/etc/systemd/system/paperclip.service`:

```ini
[Service]
# ... altre direttive ...
ExecStartPre=/home/vpshsqxf/.paperclip/scripts/pre-start-backup.sh
ExecStopPost=/home/vpshsqxf/.paperclip/scripts/post-stop-cleanup.sh
```

Script `pre-start-backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR=/home/vpshsqxf/.paperclip/instances/default/data/backups
cd /home/vpshsqxf/.paperclip/sviluppo
pnpm paperclipai db:backup || true
# Mantieni solo ultimi 10 backup
ls -t $BACKUP_DIR/*.sql.gz | tail -n +11 | xargs rm -f
```

## Troubleshooting

### Service Non Si Avvia

```bash
# Verifica configurazione
sudo systemd-analyze verify paperclip.service

# Log dettagliato
sudo journalctl -u paperclip -n 200 --no-pager

# Test manuale
sudo -u vpshsqxf /usr/bin/pnpm --filter @paperclipai/server dev
```

### UI Chrome Disconnette

1. Controlla WebSocket in DevTools (F12 → Network → WS)
2. Verifica CORS config nel server
3. Controlla Chrome tab discarding: `chrome://discards/`
4. Pulisci Service Worker: DevTools → Application → Clear storage

### Database Out-of-Sync

```bash
# Force reconnect embedded postgres
sudo systemctl stop paperclip
pkill -f "postgres.*54329"
sudo systemctl start paperclip
```

### Heartbeat Agents Bloccati

```bash
# Query agents con heartbeat stale
curl http://localhost:3100/api/agents/stale

# Reset heartbeat
curl -X POST http://localhost:3100/api/agents/reset-heartbeats
```

## Checklist Produzione

- [ ] Systemd service creato e abilitato
- [ ] Restart=always configurato
- [ ] EnvironmentFile con secrets
- [ ] Log rotation attivo (journald + file)
- [ ] Health check monitor attivo
- [ ] Backup pre-restart configurato
- [ ] Chrome flags ottimizzate
- [ ] Tab keep-alive configurato
- [ ] WebSocket keep-alive abilitato
- [ ] Session persistence abilitata
- [ ] Agent heartbeat timeout tarato
- [ ] Alerting su failure configurato
- [ ] DNS/Reverse proxy con nginx (se remoto)

## Reverse Proxy Nginx (per VPS remota)

```nginx
# /etc/nginx/sites-available/paperclip
server {
    listen 443 ssl http2;
    server_name paperclip.esempio.com;

    ssl_certificate /etc/letsencrypt/live/paperclip.esempio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/paperclip.esempio.com/privkey.pem;

    # WebSocket support
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts per long-polling
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;

        # Buffering
        proxy_buffering off;
        proxy_cache off;
    }
}
```

## Riferimenti

- [Systemd Unit Files](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Chrome Tab Discarding](https://www.chromium.org/developers/design-documents/tab-discarding-and-reloading/)
- [WebSocket Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

---

**Last Updated**: 2026-04-14  
**Version**: 1.0.0  
**Status**: Production-ready configuration