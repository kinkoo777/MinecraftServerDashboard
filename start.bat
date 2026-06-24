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

rem ---- Java: check for version 21+ (needed to run the Minecraft server) ----
set "JAVA_OK=0"
where java >nul 2>nul
if not errorlevel 1 (
  rem Java found — parse the major version
  set "JVER="
  for /f "tokens=3" %%a in ('java -version 2^>^&1 ^| findstr /i "version"') do if not defined JVER set "JVER=%%~a"
  set "JMAJ=0"
  for /f "tokens=1 delims=." %%m in ("!JVER!") do set "JMAJ=%%m"
  if "!JMAJ!"=="1" for /f "tokens=2 delims=." %%m in ("!JVER!") do set "JMAJ=%%m"
  if !JMAJ! GEQ 21 (
    set "JAVA_OK=1"
  ) else (
    echo  Java !JMAJ! is installed, but Minecraft needs Java 21 or newer.
    echo  Upgrading Java now...
    echo.
  )
)

if "!JAVA_OK!"=="0" (
  where winget >nul 2>nul
  if not errorlevel 1 (
    echo  Installing Java 21 ^(this may take a minute^)...
    winget install -e --id EclipseAdoptium.Temurin.21.JRE --accept-source-agreements --accept-package-agreements
    echo.
    rem Find the newly installed Java and add to PATH for this session
    set "JBIN="
    for /d %%d in ("C:\Program Files\Eclipse Adoptium\jre-21*") do set "JBIN=%%d\bin"
    for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk-21*") do set "JBIN=%%d\bin"
    if defined JBIN (
      set "PATH=!JBIN!;!PATH!"
      echo  Using Java 21 from !JBIN!
    ) else (
      echo  Java installed. If the server still won't start, close this window
      echo  and run start.bat again so the new Java is picked up.
    )
    echo.
  ) else (
    echo  Java is needed to run the Minecraft server.
    echo  Install Java 21 from https://adoptium.net, then run start.bat again.
    start "" https://adoptium.net/temurin/releases/?version=21
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
