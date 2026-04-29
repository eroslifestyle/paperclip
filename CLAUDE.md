# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

This is the **Paperclip data directory** (`~/.paperclip`), the runtime home for a Paperclip instance. Paperclip is an open-source Node.js/React platform that orchestrates teams of AI agents as autonomous companies — with org charts, budgets, governance, goal alignment, and heartbeat-based coordination.

The source code lives separately (typically cloned from `github.com/paperclipai/paperclip`). This directory stores instance runtime state only.

## Data Directory Layout

```
~/.paperclip/
  instances/default/
    config.json          # Instance configuration (DB, server, auth, storage, secrets, telemetry)
    .env                 # Runtime env vars (JWT secret, API keys)
    db/                  # Embedded PostgreSQL 18 data directory
    data/
      backups/           # Automatic hourly DB backups (30-day retention)
      storage/           # Local disk file storage (uploads, attachments)
      run-logs/          # Agent heartbeat run logs
    secrets/
      master.key         # Local encryption master key for secret storage
    logs/                # Application logs
    companies/<uuid>/    # Per-company data (e.g., codex-home)
    projects/<uuid>/     # Per-project data (skills, CLAUDE.md overrides)
    workspaces/<uuid>/   # Per-agent default workspaces
    skills/<uuid>/       # Company skill documents
    telemetry/           # Anonymous telemetry state
```

## Instance Configuration

Key settings in `instances/default/config.json`:
- **Database**: embedded-postgres on port 54329 (auto-managed, no external DB required)
- **Server**: `127.0.0.1:3100`, `local_trusted` mode, UI served by API server
- **Storage**: `local_disk` provider at `data/storage/`
- **Secrets**: `local_encrypted` with master key file
- **Backups**: enabled, 60-min interval, 30-day retention

## Common Operations

### From the source repo (not this directory):

```sh
pnpm dev                  # Start API + UI in watch mode (localhost:3100)
pnpm dev:once             # Start without file watching (auto-migrates DB)
pnpm dev:server           # Server only
pnpm build                # Build all packages
pnpm typecheck            # TypeScript check across all packages
pnpm test:run             # Run vitest suite
pnpm test:e2e             # Playwright E2E tests
pnpm db:generate          # Generate Drizzle migration from schema changes
pnpm db:migrate           # Apply pending migrations
pnpm paperclipai doctor   # Health check with optional --repair
pnpm paperclipai db:backup  # Manual one-off backup
```

### Health checks:

```sh
curl http://localhost:3100/api/health     # {"status":"ok"}
curl http://localhost:3100/api/companies  # JSON array
```

### Reset local dev database:

```sh
rm -rf ~/.paperclip/instances/default/db
pnpm dev   # Recreates DB from scratch
```

## Source Architecture (pnpm monorepo)

| Package | Purpose |
|---|---|
| `server/` | Express REST API, orchestration services, heartbeat system, plugin host |
| `ui/` | React + Vite board UI |
| `cli/` | `paperclipai` CLI tool (onboard, configure, doctor, worktree, issue management) |
| `packages/db/` | Drizzle ORM schema, migrations, embedded-postgres client |
| `packages/shared/` | Types, constants, validators, API path constants (shared across server/ui/cli) |
| `packages/adapters/` | Agent adapter implementations (claude-local, codex-local, cursor-local, openclaw-gateway, gemini-local, qwen-local, zai-local, pi-local, opencode-local) |
| `packages/adapter-utils/` | Shared adapter utilities |
| `packages/mcp-server/` | MCP server package |
| `packages/plugins/` | Plugin SDK, create-paperclip-plugin scaffolder, example plugins |

### Key architectural patterns:

- **Everything is company-scoped.** All domain entities belong to a company; routes/services enforce company boundaries.
- **Adapter pattern for agents.** Each AI provider (Claude, Codex, Cursor, OpenClaw, etc.) has a server-side adapter and optional UI adapter. Adapters are registered in mutable registries, supporting both built-in and external plugin adapters.
- **Heartbeat-based coordination.** Agents wake on scheduled heartbeats, check for work, execute tasks, and report back. Sessions persist across heartbeats.
- **Atomic task checkout.** Issue assignment and budget enforcement are atomic — no double-work, no runaway spend.
- **Goal hierarchy.** Company → project → goals → issues. Tasks carry full goal ancestry for agent context.
- **Plugin system.** External plugins can register adapters, capabilities, tools, and jobs via the plugin SDK.

### Database change workflow:

1. Edit `packages/db/src/schema/*.ts`
2. Export new tables from `packages/db/src/schema/index.ts`
3. `pnpm db:generate` (compiles schema first, then generates migration)
4. `pnpm -r typecheck` to validate

### Contract sync rule:

Schema/API changes must be synchronized across all layers: `packages/db` → `packages/shared` → `server` → `ui`.

## Environment Variables

- `DATABASE_URL`: unset = embedded postgres; set = external postgres
- `PAPERCLIP_HOME`: override data directory root (default: `~/.paperclip`)
- `PAPERCLIP_INSTANCE_ID`: instance name (default: `default`)
- `PAPERCLIP_TELEMETRY_DISABLED=1`: disable telemetry
- `PAPERCLIP_ENABLE_COMPANY_DELETION`: toggle company deletion (default: enabled in local_trusted)
- `PAPERCLIP_SECRETS_STRICT_MODE=true`: require secret refs for sensitive env keys

## Testing

- **Unit/integration**: vitest (projects: `packages/db`, `packages/adapters/codex-local`, `packages/adapters/opencode-local`, `server`, `ui`, `cli`)
- **E2E**: Playwright (`tests/e2e/`)
- **Smoke**: OpenClaw join harness (`pnpm smoke:openclaw-join`)
- **Evals**: promptfoo (`evals/promptfoo/`)

Run a single test file: `npx vitest run path/to/file.test.ts`

## Key Reference Docs (in source repo)

- `AGENTS.md` — Contributor guidance and engineering rules
- `doc/DEVELOPING.md` — Full dev setup guide
- `doc/DATABASE.md` — DB modes and Drizzle workflow
- `doc/SPEC-implementation.md` — V1 build contract
- `doc/PRODUCT.md` — Product spec
- `doc/GOAL.md` — Vision and architecture overview
- `doc/CLI.md` — CLI command reference
