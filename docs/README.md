---
title: Paperclip Instance Documentation
version: 2.1.0
date: 2026-04-13
---

# Paperclip Data Directory

Runtime home per un'istanza Paperclip AI (`~/.paperclip`).

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

## Instance Status

- **Instance ID**: `default`
- **Deployment Mode**: `local_trusted`
- **Companies**: 2 (1 single-agent, 1 multi-agent con 15+ agents)
- **Runtime Skills**: 17 (CEO/CTO advisors, SEO, QA, DevOps, UI/UX, etc.)
- **Active Workspaces**: 20+ agent workspaces
- **Projects**: coinempire-web (Next.js + React Native + Helm/K8s)

## Common Operations

```sh
# Health check
curl http://localhost:3100/api/health

# List companies
curl http://localhost:3100/api/companies

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

## Documentation Index

| Document | Description |
|---|---|
| [Architecture](architecture.md) | Directory structure, configuration, data flow |
| [ZAI GLM Adapter](zai-glm-adapter.md) | Adapter GLM: config, concurrency, fallback, streaming |
| [Adapter System](adapter-system.md) | Architettura generale adapter, interfacce, come aggiungerne uno |
| [Work Log](worklog.md) | Registro attività recenti, bug fixes, lessons learned |
| [Todo List](todolist.md) | Task list sincronizzata con stato progetto |
| [CLAUDE.md](../CLAUDE.md) | Claude Code project instructions |

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
| `ZAI_API_KEY_PAID` | (unset) | Legacy paid-tier ZAI key |
| `ZAI_API_KEY_FREE` | (unset) | Legacy free-tier ZAI key |
