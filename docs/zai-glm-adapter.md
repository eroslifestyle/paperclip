---
title: ZAI GLM Adapter — Architettura e Configurazione
version: 2.0.0
date: 2026-04-11
---

# ZAI GLM Adapter

Adapter HTTP puro per i modelli GLM di Z.AI. Supporta multi-key pool, concurrency file-based, fallback chain, e streaming SSE.

## Indice

- [Panoramica](#panoramica)
- [File Structure](#file-structure)
- [Configurazione API Keys](#configurazione-api-keys)
- [Modelli Supportati](#modelli-supportati)
- [Concurrency Manager](#concurrency-manager)
- [Fallback Chain](#fallback-chain)
- [Streaming SSE](#streaming-sse)
- [Bug Fix Noti](#bug-fix-noti)
- [Server Routes](#server-routes)
- [UI Settings](#ui-settings)
- [Stress Test](#stress-test)

## Panoramica

L'adapter `zai-local` e' un adapter HTTP che chiama direttamente l'API Z.AI (`https://api.z.ai/api/coding/paas/v4/chat/completions`). Non richiede CLI locale — e' un pure HTTP adapter.

Caratteristiche principali:
- **Multi-key pool**: fino a 20 API keys per parallelismo
- **File-based concurrency**: slot files in `~/.zai-slots/` per safety cross-process
- **Model fallback**: dopo 3 retry su 429, passa automaticamente a modello piu' economico
- **Streaming SSE**: supporto completo streaming con parsing delta.content e delta.reasoning_content
- **Cost estimation**: calcolo automatico costo per ogni richiesta

## File Structure

```
packages/adapters/zai-local/src/
  index.ts                 # Entry point: type, label, models, constants
  server/
    index.ts               # Barrel: re-exports execute, testEnvironment, listSkills, syncSkills
    execute.ts             # Core execution (393 linee): API call, retry, streaming, cost
    concurrency.ts         # ZaiConcurrencyManager: multi-key pool, slot-based concurrency
    skills.ts              # Skill discovery (pure HTTP, no disk symlinks)

server/src/
  adapters/
    builtin-adapter-types.ts  # Registra "zai_local" come built-in
    registry.ts               # Map type→execute/test/models per ogni adapter
  routes/
    zai-settings.ts           # REST API: status, save/test/delete API key

ui/src/pages/
  InstanceZaiSettings.tsx     # React UI: connection status, key management, pricing table
```

## Configurazione API Keys

### Priorita' di caricamento (da `concurrency.ts`)

| Priorita' | Variabile | Formato | Parallelismo |
|---|---|---|---|
| 1 | `ZAI_API_KEYS` | `"key1,key2,key3"` | N keys = N slot |
| 2 | `ZAI_API_KEY_0..19` | Singola per variabile | N keys = N slot |
| 3 | `ZAI_API_KEY_PAID` + `ZAI_API_KEY_FREE` | Legacy dual-key | 2 slot |
| 4 | `ZAI_API_KEY` | Singola universale | 1 slot |

### Ottenere le keys

1. Vai su https://z.ai/chat
2. Profilo → API Keys
3. Genera una o piu' keys

### Configurazione via UI

Naviga su Instance Settings → Zai GLM API nel board UI. Inserisci la key, clicca "Salva e Testa".

### Configurazione via file

La key viene salvata in `~/.zai/api_key` (permessi 0600). Il server la legge all'avvio e la imposta come `process.env.ZAI_API_KEY`.

## Modelli Supportati

| Modello | Input $/1M | Output $/1M | Tier | Note |
|---|---|---|---|---|
| `glm-5.1` | $1.40 | $4.40 | paid | Flagship, 200K context |
| `glm-5` | $0.72 | $2.30 | paid | Standard |
| `glm-5-turbo` | $1.20 | $4.00 | paid | Fast variant |
| `glm-4.7` | $0.50 | $1.50 | paid | Default |
| `glm-4.7-flash` | **$0** | **$0** | free | Gratuito |
| `glm-4.6` | $0.50 | $1.50 | paid | Legacy |
| `glm-4.5` | $0.30 | $0.60 | paid | Economico |
| `glm-4.5-flash` | **$0** | **$0** | free | Gratuito |
| `glm-4.5-air` | $0.15 | $0.30 | paid | Ultra-economico |

Default: `glm-4.7`

## Concurrency Manager

Il `ZaiConcurrencyManager` gestisce il parallelismo tra agenti Paperclip:

### Come funziona

1. Ogni API key = 1 slot concorrente
2. N keys = N richieste parallele
3. Slot files in `~/.zai-slots/slot-{index}` con formato `PID:timestamp`
4. Cross-process safe: ogni processo controlla se il PID e' vivo prima di reclamare uno slot

### Parametri

| Parametro | Valore | Descrizione |
|---|---|---|
| `POLL_BASE_MS` | 2000 | Intervallo base polling |
| `POLL_JITTER_MS` | 3000 | Jitter random per desincronizzare |
| `MAX_WAIT_MS` | 300000 (5 min) | Timeout massimo attesa slot |
| `INITIAL_JITTER_MS` | 5000 | Jitter iniziale per desinc agenti heartbeat |
| `STALE_THRESHOLD_MS` | 600000 (10 min) | Soglia slot stale per reclaim |

### Flusso di acquisizione

```
1. Initial jitter (random 0-5s) per desincronizzare heartbeat agents
2. Randomized slot order (shuffle) per evitare thundering herd su slot-0
3. First pass: tenta tutti gli slot in ordine random
4. Se tutti occupati: polling con jitter
5. Timeout dopo 5 minuti → procede senza slot (fallback)
6. Cleanup su exit/SIGTERM/SIGINT
```

### Attenzione: Rate Limit per Account

Z.AI impone rate limit per **account**, non per singola API key. Tutte le keys condividono lo stesso budget. Le keys extra servono per **resilienza** (rotazione su 429), non per aumentare il parallelismo effettivo.

## Fallback Chain

Dopo 3 retry consecutivi su HTTP 429, l'adapter passa automaticamente a un modello piu' economico:

```
glm-5.1     → glm-4.7     → glm-4.7-flash
glm-5       → glm-4.7     → glm-4.7-flash
glm-5-turbo → glm-4.7     → glm-4.7-flash
glm-4.7     → glm-4.7-flash
glm-4.6     → glm-4.7-flash
glm-4.5     → glm-4.5-flash
glm-4.5-air → glm-4.5-flash
```

Massimo 8 retry totali, con exponential backoff (5s base) + jitter.

## Streaming SSE

Supporto completo streaming Server-Sent Events:

- Parsing `data: {json}` lines
- Supporto `delta.content` (GLM-5.1) e `delta.reasoning_content` (GLM-4.7, flash models)
- Ogni chunk emette un JSON event `{ type: "assistant", message: { text } }`
- Usage tokens letti dal chunk finale con `chunk.usage`

### Bug noto: reasoning_content vs content

GLM-4.7, GLM-4.7-flash e GLM-4.5-flash mettono l'output nel campo `reasoning_content` invece di `content`. L'adapter gestisce automaticamente entrambi i campi:

```typescript
// Streaming
const contentPiece = delta?.content || delta?.reasoning_content || "";

// Non-streaming
fullContent = (msg?.content as string) ?? (msg?.reasoning_content as string) ?? "";
```

## Bug Fix Noti

| Bug | Problema | Fix | File |
|---|---|---|---|
| Slot timeout | Se tutti gli slot occupati, procedeva senza fallback | Timeout → proceed without slot + warning | `concurrency.ts:230-234` |
| Fallback chain | Nessun fallback automatico su 429 | Dopo 3 retry → cade a modello piu' economico | `execute.ts:198-207` |
| Slot tracking | mySlot non tracciato correttamente | `this.acquiredSlot` nel constructor | `concurrency.ts:157` |
| reasoning_content | Flash models: output in campo sbagliato | Check entrambi i campi content/reasoning | `execute.ts:297,322` |
| Error code 1305 | Non gestito nei retry | Trattato come 1302 (concurrency) | `execute.ts:239` |

## Server Routes

### `GET /instance/settings/zai/status`
Stato connessione: se ha key salvata o env key, preview della key attiva.

### `POST /instance/settings/zai/api-key`
Salva API key in `~/.zai/api_key` (mode 0600), testa con `glm-4.5-flash`.

### `GET /instance/settings/zai/api-key-status`
Solo stato della key (senza verificare connessione).

### `DELETE /instance/settings/zai/api-key`
Rimuove la key salvata e cancella dalla env.

### `POST /instance/settings/zai/test`
Testa la connessione con la key attiva usando `glm-4.5-flash`.

## UI Settings

`InstanceZaiSettings.tsx` fornisce:

1. **Connection Status Card**: connesso/non connesso, preview key, path file
2. **API Key Card**: input password, salva+testa, rimuovi
3. **Test Connection Card**: bottone test con risultato
4. **Pricing Table**: tabella modelli con prezzi

## Stress Test

`sviluppo/stress_test_zai.py` testa tutti i subsystem:

| Test | Cosa verifica |
|---|---|
| T1 | Singola richiesta per modello |
| T2 | reasoning_content nei flash models |
| T3 | Richieste concorrenti (trigger 429) |
| T4 | Slot file management per-tier |
| T5 | Fallback chain (glm-5.1 → glm-4.7 → flash) |
| T6 | Error code handling (1302, 1305) |
| T7 | Cross-tier parallelism (paid+free simultanei) |

Usage: `python3 stress_test_zai.py --concurrent 3 --rounds 2`

## Adapter Registration

L'adapter e' registrato nel sistema Paperclip tramite:

1. **`builtin-adapter-types.ts`**: `"zai_local"` dichiarato come built-in
2. **`registry.ts`**: importa execute, testEnvironment, models, agentConfigurationDoc
3. **`server/package.json`**: dipendenza `"@paperclipai/adapter-zai-local": "workspace:*"`
4. **`app.ts`**: monta `zaiSettingsRoutes()`
5. **`App.tsx`**: importa `InstanceZaiSettings` e aggiunge la route

## Parametri di Esecuzione

Configurabili tramite `config` dell'adapter:

| Parametro | Default | Descrizione |
|---|---|---|
| `model` | `glm-4.7` | Modello GLM da usare |
| `thinking` | `true` | Abilita thinking mode |
| `maxTokens` | `4096` | Max tokens output |
| `temperature` | `0.6` | Temperature sampling |
| `stream` | `true` | Streaming SSE attivo |
| `timeoutSec` | `300` | Timeout richiesta in secondi |
| `systemPrompt` | `""` | System prompt opzionale |
| `promptTemplate` | Default template | Template con variabili Paperclip |
| `instructionsFilePath` | `""` | Path file istruzioni aggiuntive |
