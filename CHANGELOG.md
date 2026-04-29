---
title: Changelog
version: 2.1.0
date: 2026-04-13
---

# Changelog

Tutti i cambiamenti significativi a questo progetto saranno documentati in questo file.

Il formato segue il modello [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added
- Sistema di pulizia automatica per prevenire errori di encoding (0x00 null bytes)
- Configurazione ZAI GLM Adapter nella pagina Agent con tab dedicata
- Supporto per 9 modelli GLM con selezione avanzata
- 6 categorie di permessi configurabili (Read/Write/Delete Files, Execute Commands, Network, Web Search)
- 10 categorie di skill abilitabili (Code, Documentation, Testing, etc.)
- Opzioni avanzate per ZAI GLM (token, temperatura, system prompt, thinking mode)
- API endpoints per maintenance (`/api/maintenance/*`)
- UI per configurazione manutenzione (`/instance/settings/maintenance`)
- Script di avvio con maintenance integrato
- Test di integrazione per sistema ZAI e maintenance
- Documentazione completa per tutte le nuove feature

### Changed
- Aggiornamento versione Paperclip a 2.1.0
- Migliorata stabilità con sistema di pulizia automatico
- Estesa configurazione adapter per agenti multipli
- Migliorata documentazione istanza

### Fixed
- Errori di encoding "0x00(adapter_failed)" tramite pulizia automatica file temporanei
- File log corrotti tramite rotazione automatica
- 404 errors per nuove API routes
- Package.json corrotto con ricreazione struttura JSON valida

### Deprecated

### Removed

### Security

### Documentation

## [2.0.0] - 2026-04-11

### Added
- Documentazione completa dell'istanza Paperclip
- Setup di base con embedded PostgreSQL
- Configurazione ZAI GLM base con pool di chiavi
- 17 runtime skills tra cui CEO/CTO, DevOps, UI/UX
- Multi-company support con coinempire-web project
- API endpoints per companies, health check, backups
- Script di utility per backup e reset database

### Changed
- Migliorata organizzazione directory per istanza
- Aggiunto sistema di backup automatico (hourly, 30-day retention)
- Configurazione environment variables completa
- Health check e monitoring system

### Fixed
- Problemi di connessione con database embedded
- Errori di permessi su directory
- Configuration file validation

### Deprecated

### Removed

### Security
- Implementata crittografia per secrets con master key
- Controllo accessi basato su company scope

### Documentation
- Documentazione API e configuration
- Guide per common operations
- Troubleshooting section

## [1.0.0] - 2026-04-06

### Added
- Initial Paperclip instance setup
- Embedded PostgreSQL database configuration
- Basic server and UI setup
- Local development environment
- Basic API endpoints
- File storage system
- Secret management system

### Changed
- First stable release of Paperclip instance

### Fixed

### Deprecated

### Removed

### Security

### Documentation

---

**Note per future versioni**:
- Tutte le nuove feature devono essere documentate in questo changelog
- Usare conventional commits per garantire coerenza
- Aggiungere sempre la data nel formato YYYY-MM-DD
- Mantenere la sezione [Unreleased] fino al release