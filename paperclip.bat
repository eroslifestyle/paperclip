@echo off
title PaperClip

:: Kill eventuali postgres orfani che bloccano la directory DB
taskkill /F /IM postgres.exe >NUL 2>&1

:: Se il DB e' corrotto (PG_VERSION senza pg_control), eliminalo
:: In modo che PG possa reinizializzare da zero
set "DBDIR=%USERPROFILE%\.paperclip\instances\default\db"
if exist "%DBDIR%\PG_VERSION" (
    if not exist "%DBDIR%\global\pg_control" (
        echo [FIX] Database corrotto rilevato, pulizia in corso...
        rd /s /q "%DBDIR%" 2>NUL
        echo [FIX] Database pulito, verra' reinizializzato.
    )
)

:: Avvia il server
cd /d "D:\Dropbox\1_Forex\Programmazione\PaperClip\server"
set PAPERCLIP_MIGRATION_AUTO_APPLY=true
set PAPERCLIP_MIGRATION_PROMPT=never
set PAPERCLIP_EMBEDDED_POSTGRES_VERBOSE=false
set PAPERCLIP_OPEN_ON_LISTEN=true
npx tsx src/index.ts

pause
