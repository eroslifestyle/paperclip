# ZAI GLM Adapter Configuration per Agenti

## Panoramica

Ho implementato una sezione completa per la configurazione dell'adapter ZAI GLM nella pagina Agent di Paperclip, simile a quella disponibile per Claude Code Local. La configurazione include:

- **Selezione del modello AI** con opzioni per i modelli GLM di Zhipu AI
- **Configurazione dei permessi** per controllare cosa può fare l'agente
- **Abilitazione delle skill** per selezionare quali competenze utilizzare
- **Parametri avanzati** come token massimi, temperatura, e thinking

## Caratteristiche Implementate

### 1. Selezione del Modello AI

Sono disponibili tutti i modelli GLM:
- **GLM-5.1** (flagship, 200K context) - Premium
- **GLM-5** - Standard
- **GLM-5 Turbo** - Standard
- **GLM-4.7** - Standard
- **GLM-4.7 Flash** (gratuito) - Free
- **GLM-4.6** - Legacy
- **GLM-4.5** - Legacy
- **GLM-4.5 Flash** (gratuito) - Free
- **GLM-4.5 Air** - Basic

### 2. Permessi dell'Agente

Configurare cosa l'agente può fare:
- **Read Files** - Leggere file del progetto
- **Write Files** - Modificare e creare file
- **Delete Files** - Cancellare file e directory
- **Execute Commands** - Eseguire comandi shell
- **Network Access** - Fare richieste HTTP
- **Web Search** - Cercare su internet

### 3. Skill Disponibili

Le skill sono organizzate per categorie:
- Code Analysis
- Code Generation
- Code Review
- Documentation
- Testing
- Debugging
- Refactoring
- Architecture
- Performance
- Security

### 4. Opzioni Avanzate

- **Enable Extended Thinking**: Permette al modello di ragionare passo dopo passo
- **Enable Model Hierarchy**: Seleziona automaticamente il modello migliore in base alla complessità del task
- **Max Tokens**: Configura la lunghezza massima della risposta
- **Temperature**: Controlla la casualità delle risposte (0.0 - 2.0)
- **System Prompt**: Definisce il comportamento e la personalità dell'AI

## Come Utilizzare

### 1. Accedere alla Configurazione

1. Navigare alla pagina degli agenti
2. Selezionare l'agente desiderato
3. Cliccare sulla tab "ZAI GLM"

### 2. Configurare l'Adapter

1. **Abilitare l'adapter** usando lo switch in alto a destra
2. **Selezionare il modello** desiderato dal menu a tendina
3. **Configurare i permessi** spuntando le caselle appropriate
4. **Selezionare le skill** abilitando quelle necessarie
5. **Regolare i parametri avanzati** se necessario
6. **Inserire la ZAI API Key** (se non già configurata)
7. **Cliccare "Save Configuration"**

### 3. Configurazione dell'API Key

Per utilizzare ZAI GLM, è necessaria una API key:
1. Visitare [z.ai/chat](https://z.ai/chat)
2. Accedere al proprio account
3. Andare in Profile → API Keys
4. Creare una nuova API key
5. Inserirla nella sezione "API Configuration"

## File Creati

### Componenti UI
- `AgentZaiAdapterConfig.tsx` - Componente principale per la configurazione ZAI
- `AgentClaudeAdapterConfig.tsx` - Componente per la configurazione Claude (riferimento)
- `AgentDetail.tsx` - Pagina dettaglio agente con tab per gli adapter

### Componenti UI Base
- `badge.tsx` - Componente per badge
- `button.tsx` - Componente per pulsanti
- `card.tsx` - Componente per card
- `checkbox.tsx` - Componente per checkbox
- `input.tsx` - Componente per input
- `label.tsx` - Componente per label
- `select.tsx` - Componente per select
- `separator.tsx` - Componente per separatori
- `switch.tsx` - Componente per switch
- `tabs.tsx` - Componente per tabs
- `textarea.tsx` - Componente per textarea

### API
- `agent-adapter-config.ts` - Rotte API per la configurazione degli adapter
- `agents.ts` - Client API per gli agenti
- `company-skills.ts` - Client API per le skill dell'azienda

### Server
- Aggiornato `app.ts` per includere le rotte di configurazione degli adapter

## Esempio di Configurazione

```json
{
  "enabled": true,
  "model": "glm-4.7-flash",
  "enableHierarchy": true,
  "maxTokens": 4096,
  "temperature": 0.6,
  "thinking": true,
  "systemPrompt": "You are a helpful AI assistant specialized in software development.",
  "permissions": ["file_read", "file_write"],
  "enabledSkills": ["Code Generation", "Documentation", "Testing"]
}
```

## Note Importanti

1. **Model Hierarchy**: Quando abilitato, il sistema seleziona automaticamente:
   - GLM-5.1 per task complessi
   - GLM-4.7 per task medi
   - GLM-4.7 Flash per task semplici

2. **Free Models**: I modelli "Flash" sono gratuiti ma potrebbero avere limitazioni

3. **Permissions**: Abilitare solo i permessi necessari per la sicurezza

4. **Skills**: Le skill devono essere prima create nella sezione azienda

## Troubleshooting

### Problemi Comuni

1. **API Key non valida**
   - Verificare che l'API key sia corretta
   - Controllare che l'abbonamento sia attivo

2. **Modello non disponibile**
   - Verificare di avere accesso al modello selezionato
   - Provare con un modello diverso (es. GLM-4.7 Flash)

3. **Permessi negati**
   - Verificare che i permessi siano abilitati
   - Controllare i log del server per errori

4. **Skill non funzionanti**
   - Verificare che le skill esistano nell'azienda
   - Assicurarsi che siano abilitate

## Supporto

Per problemi o richieste di supporto:
1. Controllare i log del server
2. Verificare la configurazione
3. Consultare la documentazione di ZAI
4. Contattare il supporto tecnico

---

**Implementato il**: 2026-04-13  
**Versione**: 1.0  
**Compatibilità**: Paperclip v2026.403.0+