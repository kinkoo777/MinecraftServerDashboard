@echo off
title MC Dashboard
cd /d "%~dp0"
color 0A

echo  ============================================
echo            MC Dashboard - Launcher
echo  ============================================
echo.

rem --- Check for Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is needed to run the dashboard, but it isn't installed yet.
  echo.
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  Opening the Node.js download page in your browser.
    echo  Install it ^(just click Next/Next/Finish^), then run this file again.
    start "" https://nodejs.org/en/download/prebuilt-installer
    echo.
    pause
    exit /b
  )
  echo  Installing Node.js automatically...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  Node.js installed. Please CLOSE this window and double-click start.bat again.
  pause
  exit /b
)

rem --- Install dependencies on first run ---
if not exist "node_modules" (
  echo  First-time setup: downloading components ^(takes about a minute^)...
  call npm install
  echo.
)

rem --- Friendly heads-up about Java ---
where java >nul 2>nul
if errorlevel 1 (
  echo  NOTE: Java was not found. You can still open the dashboard, but to actually
  echo        run a Minecraft server you'll need Java. The dashboard will guide you.
  echo.
)

echo  Starting the dashboard...
echo  Your browser will open at http://localhost:8080
echo  ^(Keep this window open while you play. Close it to stop the dashboard.^)
echo.

start "" http://localhost:8080
node server/index.js

echo.
echo  The dashboard has stopped. You can close this window.
pause
