#!/usr/bin/env bash
# MC Dashboard launcher for Linux & macOS — run: ./start.sh
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "          MC Dashboard - Launcher"
echo "============================================"
echo

# ---- Node.js (required) ----
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found — installing it..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y nodejs npm
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nodejs
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm nodejs npm
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y nodejs npm
  elif command -v brew >/dev/null 2>&1; then
    brew install node
  else
    echo "Couldn't auto-install Node.js. Install it from https://nodejs.org then re-run."
    exit 1
  fi
  hash -r 2>/dev/null || true
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js install didn't complete. Please install it from https://nodejs.org and re-run."
    exit 1
  fi
  echo
fi

# ---- Java (needed to run the Minecraft server; dashboard works without it) ----
if ! command -v java >/dev/null 2>&1; then
  echo "Java not found — installing it (needed to run the server)..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y openjdk-21-jre-headless
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y java-21-openjdk-headless
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm jre-openjdk-headless
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y java-21-openjdk-headless
  elif command -v brew >/dev/null 2>&1; then
    brew install --cask temurin
  else
    echo "Couldn't auto-install Java. Install Java 21 from https://adoptium.net"
  fi
  hash -r 2>/dev/null || true
  echo
fi

# ---- First-run dependencies ----
if [ ! -d node_modules ]; then
  echo "First-time setup: installing components (about a minute)..."
  npm install
  echo
fi

echo "Starting the dashboard at http://localhost:8080"
echo "(Keep this window open while you play. Press Ctrl+C to stop.)"
echo

# open the browser shortly after the server comes up
( sleep 2; (xdg-open http://localhost:8080 || open http://localhost:8080) >/dev/null 2>&1 ) &

node server/index.js
