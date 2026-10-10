@echo off
setlocal enabledelayedexpansion
title ChunkDeck
cd /d "%~dp0"
color 0A

echo  ============================================
echo            ChunkDeck - Launcher
echo  ============================================
echo.

rem ---- Node.js (required to run the dashboard) ----
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is needed to run the dashboard, but it isn't installed yet.
  echo.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  Opening the Node.js download page. Install it ^(Next / Next / Finish^),
    echo  then double-click start.bat again.
    start "" https://nodejs.org/en/download/prebuilt-installer
    pause
    exit /b
  )
  echo  Installing Node.js for you...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  All set. Please CLOSE this window and double-click start.bat again.
  pause
  exit /b
)

rem Java is not installed here: the dashboard downloads a suitable Java by itself
rem (into the "java" folder) the first time it starts, and whenever a server needs a newer one.

rem ---- First-run dependencies ----
if not exist "node_modules" (
  echo  First-time setup: downloading components ^(about a minute^)...
  call npm install
  echo.
)

rem ---- Auto-fix known dependency vulnerabilities, if any ----
echo  Checking dependencies for security fixes...
call npm audit fix 2>nul
echo.

echo  Starting the dashboard...
echo  Your browser will open at http://localhost:8080
echo  ^(Keep this window open while you play. Close it to stop.^)
echo.

start "" http://localhost:8080
node server/index.js

echo.
echo  The dashboard has stopped. You can close this window.
pause
