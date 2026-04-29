# Sistema di Pulizia Automatica Integrato in Paperclip

## Panoramica
Ho implementato un sistema di pulizia automatica completamente integrato nel funzionamento di Paperclip che previene errori di encoding e problemi di accumulo di file temporanei, mentre fa attenzione a non interrompere task o processi attivi.

## Componenti Implementati

### 1. MaintenanceService (`server/src/services/maintenance.ts`)
- **Avvio automatico**: Si avvia all'avvio del server Paperclip
- **Esecuzione periodica**: Ogni 30 minuti (configurabile)
- **Pulizia sicura**: Controlla i task in esecuzione prima di cancellare
- **Funzionalità principali**:
  - Pulizia file temporanei vecchi (>24 ore)
  - Rotazione log file (>50MB)
  - Pulizia slot ZAI vuoti
  - Preserva file correlati a task attivi per 6 ore

### 2. API Endpoints (`server/src/routes/maintenance.ts`)
- `GET /api/maintenance/status` - Stato del servizio
- `POST /api/maintenance/run` - Esegui manutenzione immediata
- `PUT /api/maintenance/config` - Aggiorna configurazione

### 3. Configurazione (`server/src/config/maintenance.ts`)
- Caricamento configurazione dal file di configurazione principale
- Validazione dei parametri
- Logging della configurazione all'avvio

### 4. Interfaccia Utente (`ui/src/pages/InstanceMaintenanceSettings.tsx`)
- Pagina completa per la gestione della manutenzione
- Visualizzazione stato in tempo reale
- Configurazione di tutti i parametri
- Esecuzione manuale della manutenzione

### 5. Integrazione nel Sistema
- **Server** (`server/src/index.ts`): Il servizio si avvia automaticamente
- **Rotte** (`server/src/app.ts`): Endpoint API disponibili
- **UI** (`ui/src/App.tsx`): Pagina accessibile da `/instance/settings/maintenance`

## Caratteristiche di Sicurezza

### 1. Protezione Task Attivi
Il sistema verifica lo stato dei task prima di cancellare:
- Controlla task con status "running"
- Preserva file contenenti ID dei task
- Mantiene file recenti (meno di 6 ore)

### 2. Pulizia Selettiva
- Cancella solo file più vecchi di 24 ore
- Ignora file in uso
- Preserva slot ZAI con contenuto

### 3. Logging Completo
- Ogni operazione è loggata
- Errori gestiti gracefully
- Stato monitorabile via API

## Configurazione di Default

```typescript
{
  enabled: true,              // Sistema abilitato
  intervalMinutes: 30,       // Ogni 30 minuti
  maxLogSizeMB: 50,         // Rotazione log a 50MB
  maxTempFileAgeHours: 24,   // Pulisci file >24 ore
  preserveRunningTaskHours: 6 // Preserva task per 6 ore
}
```

## Come Accedere

1. Navigare a: `http://localhost:3100/instance/settings/maintenance`
2. Verificare lo stato del servizio
3. Configurare i parametri se necessario
4. Eseguire manualmente se desiderato

## Monitoraggio

### Via API
```bash
# Stato servizio
curl http://localhost:3100/api/maintenance/status

# Esegui manutenzione
curl -X POST http://localhost:3100/api/maintenance/run
```

### Via Log
I messaggi del servizio appaiono nel server log con prefisso "Maintenance service".

## Vantaggi

1. **Prevenzione Errori**: Evita accumulo di file che causano errori di encoding
2. **Performance**: Mantiene il sistema pulito e reattivo
3. **Sicurezza**: Non interrompe task o processi attivi
4. **Flessibilità**: Configurabile via UI o API
5. **Trasparenza**: Stato completamente monitorabile

## Note di Implementazione

- Il sistema si integra perfettamente con l'architettura esistente di Paperclip
- Non modifica il comportamento dei componenti esistenti
- Aggiunge solo funzionalità di pulizia automatica
- Tutte le operazioni sono non-bloccanti e asincrone

## Risoluzione Problemi

Se si verificano problemi:
1. Verificare lo stato via API endpoint
2. Controllare i log del server
3. Disabilitare temporaneamente dalla UI
4. Riavviare il servizio Paperclip se necessario

---

**Implementato il: 2026-04-12**
**Versione: 1.0**