# PROMPT: Riorganizzazione Gerarchica con Sistema di Controllo Qualità

## Destinatario
CEO dell'azienda

## Contesto Attuale
Attualmente operiamo con una struttura a 4 livelli:
- **Livello 1**: CEO (Opus)
- **Livello 2**: Ingegneri (Sonnet)
- **Livello 3**: Programmatori capo (GLM)
- **Livello 4**: Programmatori senior (GLM)

Vogliamo ottimizzare questa struttura implementando un sistema rigoroso di controllo e doppio controllo qualità che garantisca eccellenza, sicurezza e compliance in ogni fase del processo.

## Visione Strategica
Trasformare la nostra struttura attuale in un sistema organizzato a 4 livelli con catene di controllo incrociate, dove ogni livello agisce come validatore del livello successivo/precedente, implementando il principio del "doppio controllo" come best practice fondamentale.

## Struttura Ottimizzata a 4 Livelli con Sistema di Controllo

### LIVELLO 1: STRATEGIC CONTROL (CEO - OPUS)
**Composizione:**
- CEO
- CTO
- Chief Quality Officer
- Chief Security Officer

**Responsabilità di Controllo:**
- Approvazione finale di tutte le decisioni critiche
- Validazione della qualità architetturale e strategica
- Controllo dei KPI di qualità e sicurezza
- Definizione degli standard di compliance
- Applicazione del principio del "doppio controllo" sulle decisioni del Livello 2

**Meccanismi di Controllo:**
- Review settimanale delle decisioni del Livello 2
- Audit di qualità trimestrali
- Validazione degli standard prima del rilascio
- Veto power su decisioni che non rispettano gli standard

### LIVELLO 2: TECHNICAL VALIDATION (INGEGNERI - SONNET)
**Composizione:**
- Ingegneri Senior
- Solution Architects
- Lead Developers
- Quality Assurance Architects

**Responsabilità di Controllo:**
- Validazione tecnica delle soluzioni proposte
- Doppio controllo del codice prima dell'invio al Livello 3
- Verifica degli standard di programmazione
- Controllo delle dipendenze e rischi tecnici
- Validazione della test coverage

**Meccanismi di Controllo:**
- Peer review obbligatoria (2+ ingegneri)
- Static code analysis automated
- Security scan prima del passaggio al Livello 3
- Documentazione delle decisioni tecniche
- Checklist di qualità da completare prima della validazione

### LIVELLO 3: IMPLEMENTATION SUPERVISION (PROGRAMMATORI CAPO - GLM)
**Composizione:**
- Programmatori capo
- Tech Leads
- Senior Software Engineers
- QA Team Leads

**Responsabilità di Controllo:**
- Supervisione diretta dell'implementazione
- Doppio controllo del codice prodotto dal Livello 4
- Verifica degli standard di coding
- Controllo delle performance e ottimizzazione
- Validazione dei test unitari e di integrazione

**Meccanismi di Controllo:**
- Code review con checklist strutturata
- Pair programming per complessi critici
- Automated testing al 100% di coverage
- Performance testing prima della consegna
- Documentazione del controllo effettuato

### LIVELLO 4: EXECUTION QUALITY (PROGRAMMATORI SENIOR - GLM)
**Composizione:**
- Programmatori senior
- Full Stack Developers
- Specialist Developers
- Junior Developers (sotto supervisione)

**Responsabilità di Controllo:**
- Esecuzione di alta qualità con auto-controllo
- Applicazione rigorosa degli standard
- Testing automatico e manuale
- Documentazione del codice
- Segnalazione proattiva dei problemi

**Meccanismi di Controllo:**
- Self-review prima della sottomessa
- Strict adherence to coding standards
- Automated linting e formatting
- Test-driven development (TDD)
- Continuous integration con build validation

## Sistema di Doppio Controllo Quality

### Principio Fondamentale
Ogni deliverable deve essere validata da DUE persone/ruoli diversi prima di procedere al livello successivo.

### Matrice di Controllo Incrociato

| Deliverable | Controllo Livello 1 | Controllo Livello 2 | Controllo Livello 3 | Controllo Livello 4 |
|-------------|-------------------|-------------------|-------------------|-------------------|
| Decisioni Strategiche | ✓ (auto) | ✓ (validazione) | ✓ (impatto) | ✗ |
| Architetture Tecniche | ✓ (approvazione) | ✓ (peer) | ✓ (fattibilità) | ✗ |
| Design Soluzioni | ✓ (rilevanza) | ✓ (validazione) | ✓ (implementabilità) | ✓ (dettagli) |
| Codice Sorgente | ✗ | ✓ (architettura) | ✓ (standard) | ✓ (auto) |
| Test Cases | ✓ (copertura) | ✓ (completezza) | ✓ (efficacia) | ✓ (correttezza) |
| Documentation | ✓ (accuratezza) | ✓ (tecnica) | ✓ (pratica) | ✓ (dettaglio) |

## Flusso di Lavoro con Controlli Incrociati

### 1. FASE STRATEGICA (LIVELLO 1 → LIVELLO 2)
```
CEO/CTO definisce direzione strategica
↓
Doppio controllo con Quality Officer
↓
Invio a Ingegneri per validazione tecnica
↓
Feedback e approvazione finale
```

### 2. FASE TECNICA (LIVELLO 2 → LIVELLO 3)
```
Ingegneri progettano soluzione tecnica
↓
Peer review tra Ingegneri (2+ revisori)
↓
Validazione con Programmatori capo
↓
Documentazione delle decisioni
↓
Approvazione per implementazione
```

### 3. FASE IMPLEMENTATIVA (LIVELLO 3 → LIVELLO 4)
```
Programmatori capo definiscono specifiche
↓
Revisione con team QA
↓
Assegnazione a Programmatori senior
↓
Supervisione continua durante sviluppo
↓
Validazione risultati
```

### 4. FASE ESECUZIONE (LIVELLO 4 → LIVELLO 3)
```
Programmatori senior implementano
↓
Self-review e auto-testing
↓
Sottomessa a Programmatori capo per review
↓
Fix basati su feedback
↓
Doppio controllo prima del merge
```

## Standard di Qualità Obbligatori

### Standard di Codice
- 100% test coverage per codice nuovo
- Zero warnings static analysis
- Documentation inline per funzioni complesse
- Naming conventions rigorose
- Complexity metrics sotto soglia

### Standard di Review
- Ogni PR deve avere almeno 2 approvazioni
- Le approvazioni devono essere di livelli diversi
- Checklist di review completata
- Commenti di review indirizzati
- Tempo massimo per review: 24h

### Standard di Testing
- Unit tests per tutte le funzioni
- Integration tests per API
- E2E tests per flussi critici
- Performance tests per componenti pesanti
- Security scans mensili

## Governance del Controllo

### Comitato di Qualità
- Membri: CEO, CTO, Chief Quality, Chief Architect
- Incontri: Settimanali
- Responsabilità: Approvazione standard, gestione eccezioni

### Sistema di Escalation
1. Disaccordo tra livelli → Comitato di Qualità
2. Problemi di qualità → Quality Team interviene
3. Violazione standard → Report mensile a CEO

### Metriche di Controllo

### KPI di Qualità
- **Defect Escape Rate**: < 1% in produzione
- **Review Coverage**: 100% del codice
- **Test Coverage**: 95%+
- **Security Vulnerabilities**: 0 in produzione
- **Code Quality Score**: > 90/100

### KPI di Performance
- **Lead Time per PR**: < 3 giorni
- **Time to First Review**: < 4 ore
- **Build Success Rate**: > 99%
- **Uptime Sistemi Critici**: > 99.9%

## Training e Certificazione

### Programma di Certificazione
- Tutti i livelli devono essere certificati sugli standard
- Training trimestrale su best practices
- Workshop mensili su sicurezza e qualità
- Certification renewal annuale

## Implementazione del Sistema

### Fase 1: Definizione Standard (2 settimane)
- Documentare tutti gli standard di qualità
- Creare checklist per ogni tipo di deliverable
- Stabilire metriche di misurazione

### Fase 2: Training (4 settimane)
- Formare tutti i livelli sul nuovo sistema
- Pratiche di doppio controllo
- Utilizzo strumenti di automazione

### Fase 3: Pilot (4 settimane)
- Applicare il sistema a un progetto pilota
- Raccogliere feedback e migliorare
- Misurare i risultati iniziali

### Fase 4: Rollout Completo (continuo)
- Estendere a tutti i progetti
- Monitoraggio continuo dei KPI
- Ottimizzazione basata su dati

## Domande Chiave per il CEO

1. Quali sono le tolleranze accettabili per i KPI di qualità?
2. Come vogliamo bilanciare velocità vs qualità?
3. Quali conseguenze per violazioni degli standard?
4. Quale budget per strumenti di automazione del controllo?
5. Come misureremo il ROI del sistema di controllo?

## Azioni Immediate

1. Approvare la matrice di controllo incrociato
2. Autorizzare il budget per strumenti di automazione
3. Nomina del Comitato di Qualità
4. Calendarizzare training per tutti i livelli
5. Selezionare progetto pilota per implementazione

---

Questo prompt ristruttura la vostra organizzazione attuale a 4 livelli implementando un sistema rigoroso di controllo qualità con doppio controllo a ogni fase, garantendo massima affidabilità e conformità agli standard.