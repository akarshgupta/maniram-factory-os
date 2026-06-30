@echo off
:: ══════════════════════════════════════════════════════
:: Maniram Industries — Tally Sync Launcher
:: ══════════════════════════════════════════════════════
::
:: HOW TO SCHEDULE (run this daily automatically):
::   1. Open Task Scheduler (search in Start Menu)
::   2. Action → Create Basic Task
::   3. Name: "Maniram Tally Sync"
::   4. Trigger: Daily at 09:00 AM
::   5. Action: Start a program
::      Program:   C:\Windows\System32\cmd.exe
::      Arguments: /c "C:\path\to\maniram-factory-os\scripts\run-tally-sync.bat"
::   6. Finish
::
:: Or double-click this file to run manually.
:: ══════════════════════════════════════════════════════

title Maniram Industries — Tally Sync
cd /d "%~dp0"

echo.
echo ================================================
echo   Maniram Industries - Tally Sync
echo ================================================
echo.

:: Check Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Download from: https://nodejs.org
  echo.
  pause
  exit /b 1
)

:: Run sync — pass a date argument if provided (e.g. run-tally-sync.bat 2025-06-29)
if "%1"=="" (
  node fetch-tally.js
) else (
  node fetch-tally.js %1
)

echo.
if %ERRORLEVEL% EQU 0 (
  echo ================================================
  echo   SYNC SUCCESSFUL
  echo ================================================
) else (
  echo ================================================
  echo   SYNC FAILED - Check error above
  echo ================================================
)
echo.
pause
