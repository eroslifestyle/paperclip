---
title: Adapter System — Architettura Generale
version: 2.0.0
date: 2026-04-11
---

# Adapter System

Paperclip usa il pattern Adapter per supportare diversi provider AI. Ogni adapter e' un package indipendente che implementa un'interfaccia standard.

## Adapter Registrati

| Adapter | Type ID | Auth | Status |
|---|---|---|---|
| **ZAI GLM** | `zai_local` | API Key (multi-key pool) | Funzionante |
| **Qwen** | `qwen_local` | OAuth | Funzionante |
| **DeepSeek** | `deepseek_local` | API Key + Web Token | Funzionante |
| **Gemini** | `gemini` | OAuth | Solo routes/UI |

## Interfaccia Adapter

Ogni adapter DEVE esportare tramite i suoi entry points:

### Root exports (`src/index.ts`)

```typescript
export const type: string;                    // ID univoco (es. "zai_local")
export const label: string;                   // Nome human-readable
export const models: Array<{id, label}>;      // Modelli supportati
export const agentConfigurationDoc: string;   // Markdown doc per configurazione
```

### Server exports (`src/server/index.ts`)

```typescript
export function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;
export function testEnvironment?(ctx): Promise<AdapterEnvironmentTestResult>;
export function listSkills?(config): Promise<Array<{key, description}>>;
export function syncSkills?(config, desiredSkills?): Promise<{synced, removed}>;
```

### Opzionali

- `src/cli/index.ts` — CLI adapter (stub per HTTP-only)
- `src/ui/index.ts` — UI adapter (stub, gestito da server routes)

## Context e Result

### AdapterExecutionContext

```typescript
interface AdapterExecutionContext {
  runId: string;
  agent: { id, name, companyId, ... };
  runtime: { ... };
  config: Record<string, unknown>;
  context: { paperclipWake, ... };
  onLog: (stream: "stdout"|"stderr", chunk: string) => Promise<void>;
  onMeta?: (meta: Record<string, unknown>) => Promise<void>;
}
```

### AdapterExecutionResult

```typescript
interface AdapterExecutionResult {
  exitCode: number;           // 0=success, 1=error
  signal: string | null;
  timedOut: boolean;
  errorMessage?: string;
  errorCode?: string;
  usage?: { inputTokens, outputTokens };
  provider?: string;          // es. "zai"
  biller?: string;            // es. "zai"
  model?: string;             // modello effettivamente usato
  billingType?: string;       // es. "api"
  costUsd?: number;
  resultJson?: Record<string, unknown>;
  summary?: string;
}
```

## Registration Flow

```
1. Adapter package → workspace dependency di server/
2. builtin-adapter-types.ts → dichiara il type string
3. registry.ts → importa execute, testEnvironment, models, doc
4. server/routes/ → REST endpoints per auth/settings
5. ui/pages/ → React component per settings UI
6. server/app.ts → monta le routes
7. ui/App.tsx → importa e aggiunge la pagina
```

## Confronto Implementazioni

### zai-local (HTTP puro)
- Nessun CLI locale richiesto
- Multi-key pool con file-based concurrency
- Fallback chain automatica
- Streaming SSE con reasoning_content fix
- Skill injection nel prompt (no disk symlinks)

### deepseek-local (HTTP + Web Token)
- Dual auth: API key ufficiale + web token chat.deepseek.com
- Nessun concurrency manager (single key)
- Retry su 429 senza fallback chain
- Package completo: package.json, tsconfig, cli/, ui/

### qwen-local (OAuth)
- OAuth-based auth
- Package esterno (non in repo locale)
- Settings via OAuth flow nel server

## Utility Condivise (adapter-utils)

Package `@paperclipai/adapter-utils` fornisce:

- `asBoolean`, `asNumber`, `asString` — safe config parsing
- `parseObject` — parse config objects
- `renderTemplate` — template rendering con variabili
- `joinPromptSections` — join prompt sections
- `buildPaperclipEnv` — build environment for agents
- `readPaperclipRuntimeSkillEntries` — read skill entries
- `resolvePaperclipDesiredSkillNames` — resolve skill names

## Aggiungere un Nuovo Adapter

1. Crea `packages/adapters/<name>-local/`
2. Implementa `src/index.ts` e `src/server/execute.ts`
3. Aggiungi a `server/package.json` come workspace dependency
4. Registra in `builtin-adapter-types.ts`
5. Importa in `registry.ts`
6. Crea routes in `server/routes/`
7. Crea UI in `ui/pages/`
8. Monta in `app.ts` e `App.tsx`
