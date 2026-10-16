# TODO — PaperClip

## Attivo

- [ ] Merge di `upgrade/upstream-sync` su `master` (non ancora richiesto dall'utente)
- [ ] Ripristinare lo script `build` portabile Windows in `server/package.json` (perso col merge upstream)
- [ ] Eseguire la suite completa (server + ui) con `LC_ALL=C`
- [ ] Verifica strumentale del pallino arancione nel dock (GNOME blocca `GetWindows`)
- [ ] Migrazione reale del vecchio database verso la nuova istanza `~/.paperclip/instances/default`
- [ ] `pnpm audit` post-merge
- [ ] Chiamate HTTP a `/api/admin/spend-summary` (Spend Guardian) mai esercitate

## Completati

- [x] Sync del fork con upstream (`origin/master` = `f1d4bc161`) sul branch `upgrade/upstream-sync`
- [x] Normalizzazione line ending LF (`.gitattributes`) + fix `core.autocrlf` in `.git/config`
- [x] Risoluzione conflitti merge mantenendo le personalizzazioni locali (minimax_local, Spend Guardian, safe mode, global pause)
- [x] Fix typecheck `supportsAcp` su `minimax_local` (`572400ed0`)
- [x] Fix `cli-invocation-safety` (`8685670ad`)
- [x] Installazione release 2026.1012.0 con Node 24 dedicato (`~/.local/share/node24`)
- [x] Istanza nuova su `~/.paperclip/instances/default`, health ok su :3100
- [x] Launcher desktop autonomo (Chromium `--app`) + `.desktop` + icona
- [x] Dock GNOME: `dash-max-icon-size` 32→24, `paperclip.desktop` in `favorite-apps`
- [x] Pallino arancione via `StartupWMClass=chrome-127.0.0.1__-Default`
- [x] Documentazione nel vault (`PaperClip-2026-10-17`, `paperclip-2026-10-17`)