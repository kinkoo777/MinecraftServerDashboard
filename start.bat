@echo off
title MC Dashboard
cd /d "%~dp0"
color 0A

echo  ============================================
echo            MC Dashboard - Launcher
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
  where java >nul 2>nul
  if errorlevel 1 (
    echo  Installing Java ^(needed to run the server^)...
    winget install -e --id EclipseAdoptium.Temurin.21.JRE --accept-source-agreements --accept-package-agreements
  )
  echo.
  echo  All set. Please CLOSE this window and double-click start.bat again.
  pause
  exit /b
)

rem ---- Java (needed to run the Minecraft server; dashboard works without it) ----
where java >nul 2>nul
if errorlevel 1 (
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  Java is needed to run a server. Opening the download page...
    echo  Install Java 21, then restart start.bat.
    start "" https://adoptium.net/temurin/releases/
    echo.
  ) else (
    echo  Installing Java for you, please wait...
    winget install -e --id EclipseAdoptium.Temurin.21.JRE --accept-source-agreements --accept-package-agreements
    echo.
    echo  Java installed. If pressing Start doesn't work the first time,
    echo  close this window and run start.bat again so it's picked up.
    echo.
  )
)

rem ---- First-run dependencies ----
if not exist "node_modules" (
  echo  First-time setup: downloading components ^(about a minute^)...
  call npm install
  echo.
)

echo  Starting the dashboard...
echo  Your browser will open at http://localhost:8080
echo  ^(Keep this window open while you play. Close it to stop.^)
echo.

start "" http://localhost:8080
node server/index.js

echo.
echo  The dashboard has stopped. You can close this window.
pause
