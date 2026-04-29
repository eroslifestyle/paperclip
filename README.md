---
title: Paperclip Instance Documentation
version: 2.1.0
date: 2026-04-13
---

# Paperclip Instance Documentation

Documentazione completa per l'istanza Paperclip in ~/.paperclip

## Panoramica

Paperclip è una piattaforma open-source Node.js/React che orchestra team di agenti AI come compagnie autonome - con organigrammi, budget, governance, allineamento degli obiettivi e coordinamento basato su heartbeat.

Questa istanza contiene:
- **Sistema di pulizia automatica** per prevenire errori di encoding
- **Configurazione ZAI GLM Adapter** con permessi, modelli e skill
- **17 runtime skills** tra cui CEO/CTO advisors, SEO, QA, DevOps, UI/UX
- **2 aziende** (1 single-agent, 1 multi-agent con 15+ agenti)
- **20+ workspaces** attivi per agenti

## Quick Reference

| Resource | Location |
|---|---|
| API Server | `http://127.0.0.1:3100` |
| Health Check | `GET /api/health` |
| Companies API | `GET /api/companies` |
| Instance Config | `instances/default/config.json` |
| Database | Embedded PostgreSQL 18, port 54329 |
| Backups | `instances/default/data/backups/` (hourly, 30-day retention) |
| Run Logs | `instances/default/data/run-logs/` |
| File Storage | `instances/default/data/storage/` |
| Secrets | `instances/default/secrets/master.key` |
| ZAI API Key | `~/.zai/api_key` |
| ZAI Slots | `~/.zai-slots/slot-{0..N}` |

## Common Operations

```sh
# Health check
curl http://localhost:3100/api/health

# List companies
curl http://localhost:3100/api/companies

# Avvio con sistema di pulizia automatica
cd /home/vpshsqxf/.paperclip/instances/default
./start-paperclip-with-maintenance.sh

# Test sistema di pulizia
./verify_maintenance_integration.sh

# Test configurazione ZAI
./test_zai_adapter_config.sh

# Reset database (from source repo)
rm -rf ~/.paperclip/instances/default/db
pnpm dev

# Manual backup (from source repo)
pnpm paperclipai db:backup

# Doctor check (from source repo)
pnpm paperclipai doctor --repair

# ZAI GLM stress test
cd ~/.paperclip/sviluppo
python3 stress_test_zai.py --concurrent 3 --rounds 2
```

## Struttura Directory

```
~/.paperclip/
├── instances/default/
│   ├── config.json          # Configurazione istanza
│   ├── .env                 # Environment variables
│   ├── db/                  # Database PostgreSQL 18 embedded
│   ├── data/
│   │   ├── backups/          # Backup automatici (hourly, 30-day retention)
│   │   ├── storage/          # File storage locale
│   │   └── run-logs/        # Log dei task degli agenti
│   ├── secrets/             # Segreti critici
│   │   └── master.key       # Chiave di crittografia
│   ├── logs/                # Log applicazione
│   ├── companies/<uuid>/    # Dati per azienda
│   ├── projects/<uuid>/     # Dati progetto (skills, CLAUDE.md)
│   ├── workspaces/<uuid>/   # Workspace default per agente
│   └── skills/<uuid>/       # Documentazione skills azienda
├── docs/                    # Documentazione istanza
├── .paperclip/              # Script di manutenzione e documentazione
└── sviluppo/                # Sorgenti Paperclip (clone github)
```

## Features Implementate

### 1. Sistema di Pulizia Automatica
- **Esecuzione**: Ogni 30 minuti (configurabile)
- **Protezione task**: Preserva task attivi per 6 ore
- **Pulizia file**: Rimuove file temporanei >24 ore con null bytes
- **Rotazione log**: Ruota file log >50MB
- **Monitoraggio**: Via API (`/api/maintenance/*`) e UI (`/instance/settings/maintenance`)

### 2. ZAI GLM Adapter Configuration
- **Modelli disponibili**: 9 modelli GLM (5.1, 5, 4.7, 4.7 Flash, etc.)
- **Permessi**: 6 categorie (Read/Write/Delete Files, Execute Commands, Network, Web Search)
- **Skill**: 10 categorie abilitabili (Code, Documentation, Testing, etc.)
- **Opzioni avanzate**: Token, temperatura, system prompt, thinking mode
- **Integrazione**: Nella pagina Agent, tab "ZAI GLM"

### 3. Runtime Skills
- **Business Strategy**: CEO, CTO advisors per strategy e technology
- **Development**: DevOps, Full Stack, Frontend, Backend experts
- **Quality Assurance**: QA test planner, regression testing
- **Design**: UI/UX, frontend design specialists
- **Marketing**: SEO, content creation specialists
- **Integration**: PayPal, API integration experts
- **Security**: Security requirement extraction, vulnerability assessment

### 4. Multi-Company Support
- **coinempire-web**: Next.js + React Native + Helm/K8s deployment
- **Skills aziendali**: 17+ skills custom per ogni company
- **Workspaces**: Isolamento e configurazione per ogni agente

## API Documentation

### Health Check
```bash
GET /api/health
Response: {"status":"ok"}
```

### Companies
```bash
GET /api/companies
Response: [{"id":"uuid","name":"Company Name",...}]
```

### Maintenance API
```bash
GET /api/maintenance/status
POST /api/maintenance/run
PUT /api/maintenance/config
```

### ZAI Adapter Configuration
```bash
GET /api/agents/:id/adapter-config/zai_local
PUT /api/agents/:id/adapter-config/zai_local
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PAPERCLIP_HOME` | `~/.paperclip` | Data directory root |
| `PAPERCLIP_INSTANCE_ID` | `default` | Instance name |
| `DATABASE_URL` | (unset = embedded) | External PostgreSQL URL |
| `PAPERCLIP_TELEMETRY_DISABLED` | (unset) | Set `1` to disable telemetry |
| `PAPERCLIP_ENABLE_COMPANY_DELETION` | enabled | Toggle company deletion |
| `PAPERCLIP_SECRETS_STRICT_MODE` | `false` | Require secret refs for sensitive keys |
| `ZAI_API_KEY` | (unset) | Single ZAI API key |
| `ZAI_API_KEYS` | (unset) | Comma-separated pool of ZAI keys |
| `ZAI_API_KEY_0..19` | (unset) | Numbered ZAI keys for pool |

## ZAI GLM Configuration

### API Keys
Supporto per multiple API keys per resilience:
- Singola chiave: `ZAI_API_KEY`
- Pool di chiavi: `ZAI_API_KEYS=key1,key2,key3`
- Chiavi numerate: `ZAI_API_KEY_0`, `ZAI_API_KEY_1`, etc.

### Modello GLM-5.1
- Context: 200K tokens
- Prezzo: $1.40/1M input, $4.40/1M output
- Uso: Task complessi, architettura, ragionamento esteso

### Modello GLM-4.7 Flash (Free)
- Context: 128K tokens
- Prezzo: Gratuito
- Uso: Task semplici, ripetitivi, prototipi

## Performance Considerations

### Concurrency
- **Massimo 2 richieste ZAI simultanee** (hard limit)
- **Pool di 7 chiavi** per resilience su 429 errors
- **Backoff esponenziale** con rotazione chiave

### Resource Management
- **Embedded PostgreSQL**: Port 54329, auto-managed
- **File storage**: Local disk con retention policy
- **Backups**: Hourly, 30-day retention automatici
- **Log rotation**: Automatica >50MB

## Security

### Authentication
- **Local trusted mode**: Nessuna autenticazione richiesta in dev
- **JWT tokens**: Per production deployment
- **Secret management**: Crittografato con master key

### Data Protection
- **Backup automatici**: Hourly con retention
- **Encryption**: Secrets crittografati a riposo
- **Audit trail**: Log di tutte le operazioni

## Troubleshooting

### Common Issues

1. **Paperclip non si avvia**
   ```bash
   cd /home/vpshsqxf/.paperclip/instances/default
   tail -f paperclip.log
   ```

2. **Encoding errors (0x00)**
   ```bash
   # Sistema di pulizia automatico attivo
   # Oppure esegui manualmente:
   ./cleanup_encoding_issues.sh
   ```

3. **404 errors API**
   - Verificare che le rotte siano registrate in `server/src/app.ts`
   - Controllare log del server

4. **ZAI API rate limit**
   - Verrà usato il fallback automatico a modelli gratuiti
   - Verificare pool di chiavi disponibili

### Log Locations
- **App logs**: `instances/default/logs/`
- **Run logs**: `instances/default/data/run-logs/`
- **Maintenance logs**: Integrati nei log app

## Documentazione Correlata

- [System Architecture](docs/architecture.md) - Struttura directory, configurazione, data flow
- [ZAI GLM Adapter](docs/zai-glm-adapter.md) - Adapter GLM: config, concurrency, fallback
- [Adapter System](docs/adapter-system.md) - Architettura generale adapter
- [Maintenance System](AUTOMATIC_MAINTENANCE_SUMMARY.md) - Sistema di pulizia automatica
- [ZAI Adapter Config](ZAI_ADAPTER_CONFIG_README.md) - Configurazione ZAI per agenti

## Supporto

Per problemi o domande:
1. Controllare i log del server
2. Consultare la documentazione tecnica
3. Verificare lo stato delle API
4. Contattare il supporto Paperclip se necessario

---

**Generated**: 2026-04-13  
**Version**: 2.1.0  
**Status**: Active with maintenance and ZAI adapter features