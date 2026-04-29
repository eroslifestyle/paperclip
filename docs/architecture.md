---
title: Paperclip Data Directory Architecture
version: 1.0.0
date: 2026-04-09
---

# Architecture

Questa directory (`~/.paperclip`) e' il runtime home per un'istanza Paperclip. Paperclip e' una piattaforma Node.js/React che orchestra team di agenti AI come aziende autonome con org chart, budget, governance, goal alignment e heartbeat-based coordination.

Il codice sorgente risiede separatamente (tipicamente clonato da `github.com/paperclipai/paperclip`). Questa directory contiene solo lo stato runtime dell'istanza.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Instance Configuration](#instance-configuration)
- [Companies and Agents](#companies-and-agents)
- [Skills System](#skills-system)
- [Data Flow](#data-flow)
- [Storage Architecture](#storage-architecture)

## Directory Structure

```
~/.paperclip/
  CLAUDE.md                          # Project instructions for Claude Code
  .claude/                           # Claude Code session state
  instances/
    default/                         # Default instance (PAPERCLIP_INSTANCE_ID)
      config.json                    # Instance configuration
      db/                            # Embedded PostgreSQL 18 data directory
      data/
        backups/                     # Hourly DB backups (30-day retention)
        storage/                     # Local disk file storage (uploads, attachments)
          <company-uuid>/
            issues/                  # Issue attachments
        run-logs/                    # Agent heartbeat run logs (NDJSON)
          <company-uuid>/
            <agent-uuid>/
              <run-uuid>.ndjson      # Individual run log
      secrets/
        master.key                   # Encryption master key (local_encrypted provider)
      logs/                          # Application logs
      companies/
        <company-uuid>/
          agents/
            <agent-uuid>/
              instructions/          # Agent instruction files
                AGENTS.md            # Agent collaboration rules
                SOUL.md              # Agent personality/identity
                HEARTBEAT.md         # Heartbeat schedule config
                TOOLS.md             # Available tools for agent
      projects/
        <company-uuid>/
          <project-uuid>/
            _default/                # Default workspace checkout
      workspaces/
        <agent-uuid>/               # Per-agent workspace
          .claude/checkpoints/       # Claude Code checkpoints
          <project-files>/           # Cloned/managed project files
      skills/
        <company-uuid>/
          __runtime__/               # Compiled runtime skills
            <skill-name>--<hash>/
              SKILL.md               # Skill definition
              references/            # Skill reference docs
              scripts/               # Skill scripts
              evals/                 # Skill evaluation data
      telemetry/
        state.json                   # Anonymous telemetry state
```

## Instance Configuration

File: `instances/default/config.json`

| Setting | Value | Description |
|---|---|---|
| Database mode | `embedded-postgres` | Auto-managed PostgreSQL 18, port 54329 |
| Backup interval | 60 min | Automatic hourly backup |
| Backup retention | 30 days | Auto-cleanup old backups |
| Server host | `127.0.0.1:3100` | Localhost only |
| Deployment mode | `local_trusted` | No external auth required |
| UI serving | `serveUi: true` | API server serves React UI |
| Storage | `local_disk` | Files stored at `data/storage/` |
| Secrets | `local_encrypted` | Master key at `secrets/master.key` |
| Telemetry | enabled | Anonymous usage telemetry |

## Companies and Agents

### Current Companies

| Company UUID | Agents | Description |
|---|---|---|
| `563179d0-3bcb-4efe-8de2-dd1575f7b19b` | 1 | Single-agent company |
| `c19c83b5-1082-411d-a005-3d1fd1f1da99` | 15+ | Multi-agent company (primary) |

### Agent Instructions Structure

Each agent has 4 instruction files:

- **AGENTS.md** — Inter-agent collaboration rules
- **SOUL.md** — Agent personality, identity, behavioral guidelines
- **HEARTBEAT.md** — Schedule configuration (when/how often the agent wakes)
- **TOOLS.md** — Available tools and capabilities

### Agent Workspaces

Each agent gets a dedicated workspace directory. Some workspaces contain:
- `.claude/checkpoints/` — Session state checkpoints
- Project files (e.g., `coinempire-web/` with full Next.js project)
- Memory directories for persistent agent context

## Skills System

Company `c19c83b5` has 17 runtime skills:

| Skill | Type | Contents |
|---|---|---|
| `ceo-advisor` | Strategy | References + Python scripts (financial/strategy analyzer) |
| `cto-advisor` | Technical | References + Python scripts (tech debt/team scaling) |
| `content-strategy` | Content | References (headless CMS) + evals |
| `devops-rollout-plan` | DevOps | Rollout planning skill |
| `frontend-design` | Design | Frontend design guidelines |
| `nodejs-backend-patterns` | Backend | Advanced Node.js patterns |
| `paypal-integration` | Payment | PayPal integration guide |
| `qa-test-planner` | QA | Test templates + bug reports + shell scripts |
| `scoutqa-test` | QA | Scout QA testing skill |
| `security-requirement-extraction` | Security | Security requirements skill |
| `seo-audit` | SEO | SEO audit with AI writing detection |
| `seo-geo` | SEO | Full SEO toolkit with Python scripts (DataForSEO API) |
| `sleek-design-mobile-apps` | Mobile | Mobile app design guidelines |
| `social-content` | Social | Platform-specific content templates + evals |
| `tailwindcss-mobile-first` | CSS | TailwindCSS mobile-first patterns |
| `ui-ux-pro-max` | UI/UX | UI/UX design system with data + scripts |
| `web-design-guidelines` | Design | Web design guidelines |

## Data Flow

```
                    User Request
                         |
                    API Server (port 3100)
                         |
              +----------+-----------+
              |                      |
        Orchestrator            REST API
              |                      |
     +--------+--------+      PostgreSQL (54329)
     |        |         |            |
  Agent 1  Agent 2  Agent N    Drizzle ORM
     |        |         |
  Heartbeat  Heartbeat  Heartbeat
     |        |         |
  Workspace  Workspace  Workspace
     |        |         |
  Run Logs   Run Logs   Run Logs
```

### Heartbeat Cycle

1. Agent wakes on scheduled heartbeat
2. Checks for assigned work (issues, tasks)
3. Atomic task checkout (prevents double-work)
4. Executes task in workspace
5. Reports result via run log (NDJSON)
6. Sleeps until next heartbeat

## Storage Architecture

### Run Logs

Format: NDJSON (newline-delimited JSON)
Path: `data/run-logs/<company-uuid>/<agent-uuid>/<run-uuid>.ndjson`

Each line is a structured log entry for one heartbeat run.

### File Storage

Path: `data/storage/<company-uuid>/issues/`
Provider: `local_disk` (configurable to S3)

### Database

Embedded PostgreSQL 18 with auto-managed lifecycle.
Data directory: `instances/default/db/`
Port: 54329 (avoids conflict with system PostgreSQL)

### Secrets

Provider: `local_encrypted`
Master key: `instances/default/secrets/master.key`
Strict mode: disabled (not requiring secret refs for all sensitive env keys)

### Backups

Automatic hourly backups to `data/backups/`
Retention: 30 days
Manual backup: `pnpm paperclipai db:backup` (from source repo)
