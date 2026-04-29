@echo off
setlocal EnableDelayedExpansion
title PaperClip Launcher

REM ============================================================
REM   PaperClip - One-click launcher (Windows)
REM   - PAPERCLIP_HOME punta al repo (instances/ con dati esistenti)
REM   - Verifica node_modules / pnpm install se mancano
REM   - Pulisce postgres orfani
REM   - Avvia server con auto-migrate, browser auto-open
REM ============================================================

set "REPO_DIR=%~dp0"
if "%REPO_DIR:~-1%"=="\" set "REPO_DIR=%REPO_DIR:~0,-1%"

REM CRITICO: punta alla cartella instances/ DENTRO il repo
REM (i tuoi companies/projects/secrets/skills sono qui)
set "PAPERCLIP_HOME=%REPO_DIR%"
set "PAPERCLIP_INSTANCE_ID=default"
set "INSTANCE_DIR=%PAPERCLIP_HOME%\instances\%PAPERCLIP_INSTANCE_ID%"
set "DBDIR=%INSTANCE_DIR%\db"

echo.
echo ============================================================
echo   PaperClip - Avvio in corso
echo   Repo:        %REPO_DIR%
echo   Instance:    %INSTANCE_DIR%
echo   DB dir:      %DBDIR%
echo ============================================================
echo.

REM --- Step 1: verifica pnpm ----------------------------------
where pnpm >NUL 2>&1
if errorlevel 1 (
    echo [ERRORE] pnpm non trovato nel PATH.
    echo Installa pnpm con: npm install -g pnpm
    pause
    exit /b 1
)

REM --- Step 2: verifica node_modules --------------------------
REM Controllo file specifico per evitare falsi positivi su cartelle vuote
if not exist "%REPO_DIR%\server\node_modules\.modules.yaml" (
    echo [SETUP] node_modules mancante o incompleto. Eseguo pnpm install...
    pushd "%REPO_DIR%"
    call pnpm install
    if errorlevel 1 (
        echo [ERRORE] pnpm install fallito.
        popd
        pause
        exit /b 1
    )
    popd
    echo [SETUP] Dipendenze installate.
    echo.
) else (
    echo [OK] Dipendenze gia' installate.
)

REM --- Step 3: kill postgres orfani ---------------------------
echo [CLEAN] Termino eventuali postgres orfani sulla porta 54329...
taskkill /F /IM postgres.exe >NUL 2>&1

REM --- Step 4: verifica DB esiste e non e' corrotto -----------
if not exist "%DBDIR%\PG_VERSION" (
    echo [INFO] DB non inizializzato. Verra' creato al primo start.
) else (
    if not exist "%DBDIR%\global\pg_control" (
        echo [WARN] Database corrotto rilevato (PG_VERSION presente ma pg_control mancante^).
        echo [WARN] Backup automatico in %DBDIR%.broken-%date:~-4,4%%date:~-10,2%%date:~-7,2%
        rename "%DBDIR%" "db.broken-%date:~-4,4%%date:~-10,2%%date:~-7,2%-%random%" 2>NUL
        echo [WARN] DB rinominato. Verra' reinizializzato al prossimo start.
    ) else (
        echo [OK] DB esistente trovato e integro.
    )
)

REM --- Step 5: env vars per il server -------------------------
set "PAPERCLIP_MIGRATION_AUTO_APPLY=true"
set "PAPERCLIP_MIGRATION_PROMPT=never"
set "PAPERCLIP_EMBEDDED_POSTGRES_VERBOSE=false"
set "PAPERCLIP_OPEN_ON_LISTEN=true"

REM Carica MINIMAX_API_KEY se presente in .env del repo
if exist "%REPO_DIR%\.env.local" (
    for /f "tokens=1,2 delims==" %%a in ('type "%REPO_DIR%\.env.local" ^| findstr /I "MINIMAX_API_KEY"') do (
        set "%%a=%%b"
    )
)

REM --- Step 6: avvia server -----------------------------------
echo.
echo ============================================================
echo   Server in avvio su http://127.0.0.1:3100
echo   Premi Ctrl+C per fermare. Logs sotto.
echo ============================================================
echo.

cd /d "%REPO_DIR%\server"
npx tsx src/index.ts

REM --- Step 7: pause su exit ----------------------------------
echo.
echo Server terminato.
pause
