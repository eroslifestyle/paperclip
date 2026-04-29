@echo off
cd /d "D:\Dropbox\1_Forex\Programmazione\PaperClip\server"
set PAPERCLIP_MIGRATION_AUTO_APPLY=true
set PAPERCLIP_MIGRATION_PROMPT=never
set PAPERCLIP_EMBEDDED_POSTGRES_VERBOSE=true
set PAPERCLIP_OPEN_ON_LISTEN=false
npx tsx src/index.ts > "D:\Dropbox\1_Forex\Programmazione\PaperClip\test_run.log" 2>&1
echo Exit code: %ERRORLEVEL% >> "D:\Dropbox\1_Forex\Programmazione\PaperClip\test_run.log"
