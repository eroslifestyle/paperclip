# Quick Start - Guida Rapida

Ho implementato due sistemi principali per Paperclip:
1. **Sistema di Pulizia Automatica**
2. **Configurazione Adapter ZAI GLM per Agenti**

## Avvio Veloce

### 1. Avviare Paperclip con Pulizia Automatica

```bash
# Navigare alla directory dell'istanza
cd /home/vpshsqxf/.paperclip/instances/default

# Avviare con sistema di pulizia automatica
./start-paperclip-with-maintenance.sh
```

### 2. Accedere alle Interfacce

**Sistema di Pulizia Automatica:**
- URL: `http://localhost:3100/instance/settings/maintenance`
- Configurare intervallo, dimensioni log, ecc.
- Eseguire pulizia manuale se necessario

**Configurazione Agenti ZAI GLM:**
- URL: `http://localhost:3100/agents`
- Selezionare un agente esistente o crearne uno nuovo
- Cliccare sulla tab "ZAI GLM"
- Abilitare e configurare

### 3. Verificare il Funzionamento

```bash
# Testare il sistema di pulizia
./verify_maintenance_integration.sh

# Testare la configurazione ZAI
./test_zai_adapter_config.sh
```

## Checklist di Verifica

- [ ] Paperclip è in esecuzione
- [ ] Pagina manutenzione è accessibile
- [ ] Pagina agenti è accessibile
- [ ] Tab "ZAI GLM" è presente
- [ ] Sistema di pulizia è attivo
- [ ] Tutti i componenti UI funzionano

## File Importanti Creati

### Per la Pulizia Automatica:
- `maintenance.ts` - Servizio di pulizia
- `InstanceMaintenanceSettings.tsx` - UI manutenzione
- `AUTOMATIC_MAINTENANCE_SUMMARY.md` - Documentazione completa

### Per ZAI GLM:
- `AgentZaiAdapterConfig.tsx` - Componente configurazione ZAI
- `agent-adapter-config.ts` - API configurazione
- `ZAI_ADAPTER_CONFIG_README.md` - Documentazione ZAI

### Script Utili:
- `start-paperclip-with-maintenance.sh` - Avvio con pulizia
- `cleanup_encoding_issues.sh` - Pulizia manuale
- `verify_maintenance_integration.sh` - Verifica integrazione

## Risoluzione Problemi Comuni

### 1. Paperclip non si avvia
- Verificare che sia nella directory corretta: `/home/vpshsqxf/.paperclip/instances/default`
- Controllare i log: `tail -f paperclip.log`

### 2. Pagina non trovata (404)
- Assicurarsi di aver riavviato Paperclip dopo le modifiche
- Verificare l'URL: `http://localhost:3100`

### 3. API non funzionante
- Controllare che le rotte siano state aggiunte in `server/src/app.ts`
- Verificare i log del server per errori

### 4. ZAI API Key non valida
- Ottenere una nuova API key da: https://z.ai/chat
- Verificare che l'abbonamento sia attivo

## Supporto

Per problemi o domande:
1. Consultare i file README nella directory `.paperclip`
2. Controllare i log del server
3. Verificare la documentazione di Paperclip
4. Contattare il supporto tecnico se necessario

---

**Buon utilizzo!** 🚀