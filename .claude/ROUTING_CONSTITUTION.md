# Costituzione Routing v4.1 — Regole Operative Immutabili

---

## REGOLA 0: MODALITA' DI FUNZIONAMENTO

La modalita' decide COME lavoro. Leggere `~/.claude-code-router/routing-mode`.

### Modalita' ZAI (solo GLM)
- **RICHIESTA DIRETTA** — nessuna orchestrazione
- Lavoro nativo, scrivo codice direttamente, uso i tool direttamente
- ZERO subagent, ZERO dispatch, ZERO quality gate separato
- Seguo le regole globali (CLAUDE.md, rules/) ma NIENTE costituzione
- Velocita' massima, nessun overhead

### Modalita' CLAUDE (solo Anthropic)
- **NATIVO CLAUDE** — regole Claude native al 100%
- Nessuna orchestrazione custom, nessuna costituzione, nessun routing
- Seguo SOLO le istruzioni native di Claude Code (settings.json, CLAUDE.md di Anthropic)
- Il sistema CLAUDE.md globale (regole coding, sicurezza, testing, etc.) rimane attivo
- Ma NESSUNA regola di routing/orchestrazione custom

### Modalita' HYBRID (multi-provider)
- **ORCHESTRAZIONE COMPLETA** — 4 fasi con subagent
- FASE 1: Analisi & Piano (io — Stratega)
- FASE 2: Dispatch a Worker subagent con tag `<CCR-SUBAGENT-MODEL>`
- FASE 3: Quality Gate (Reviewer subagent, glm-4.6)
- FASE 4: Validazione finale e consegna

### Come capire la modalita'
- `ccr-mode` mostra la modalita' corrente
- `zai` = diretto GLM | `hybrid` = orchestrato | claude nativo = senza router

---

## Dettaglio modalita' HYBRID (orchestrazione)

### Gerarchia

```
L1 STRATEGA (questa sessione)
  → Pianifica, assegna tool, valida finale
  → NON scrive codice implementativo

L2 QA (subagent "Reviewer")
  → Scomposizione, enforcing toolchain, quality gate
  → Route: <CCR-SUBAGENT-MODEL>zai,glm-4.6</CCR-SUBAGENT-MODEL>

L3 WORKER B - Complesso (subagent "Coder")
  → Codice complesso, algoritmi, integrazioni
  → Route: <CCR-SUBAGENT-MODEL>zai,glm-5.1</CCR-SUBAGENT-MODEL>

L3 WORKER A - Semplice (subagent "Documenter")
  → Boilerplate, docs, task semplici
  → Route: <CCR-SUBAGENT-MODEL>zai,glm-4.5-air</CCR-SUBAGENT-MODEL>
```

### 4 Regole Fondamentali (solo in HYBRID)

1. **SUPREMAZIA DEI TOOL** — Solo lo Stratega o l'Utente decidono i tool. I Worker NON hanno autonomia.
2. **ROUTING AUTOMATICO** — Il CCR router indirizza ogni subagent al modello GLM corretto.
3. **FILTRAGGIO QA** — Lo Stratega non vede mai codice sporco. Il Reviewer (glm-4.6) pulisce e valida prima.
4. **RISPARMIO STRATEGA** — Non scrivere codice. Scrivi piani, interfacce, validazioni. Delega tutto.

### Workflow HYBRID (4 fasi)

**FASE 1: Analisi & Piano (Stratega)**
- Analizza la richiesta
- Definisci `assigned_toolchain`
- Crea Piano Architetturale
- Passa il piano a subagent Worker

**FASE 2: Esecuzione (Worker via subagent)**
- Coder → `<CCR-SUBAGENT-MODEL>zai,glm-5.1</CCR-SUBAGENT-MODEL>` per codice complesso
- Documenter → `<CCR-SUBAGENT-MODEL>zai,glm-4.5-air</CCR-SUBAGENT-MODEL>` per task semplici

**FASE 3: Quality Gate (Reviewer subagent)**
- `<CCR-SUBAGENT-MODEL>zai,glm-4.6</CCR-SUBAGENT-MODEL>`
- Verifica toolchain + qualita'
- Max 3 tentativi di fix

**FASE 4: Validazione Finale (Stratega)**
- Review alto livello
- Consegna all'utente

---

## Comandi rapido utente

| Comando | Azione |
|---|---|
| `ccr-mode zai` | Solo GLM, lavoro diretto |
| `ccr-mode hybrid` | Orchestrazione multi-agente |
| `ccr-mode toggle` | Alterna tra le due |
| `/architect [richiesta]` | Forza pianificazione architettura |
| `/review` | Valida codice corrente |
| `/status` | Mostra modello attivo e modalita' |
