#!/usr/bin/env bash
# MC Dashboard launcher for Linux & macOS — double-click or run: ./start.sh
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "          MC Dashboard - Launcher"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but not installed."
  echo "  Debian/Ubuntu:  sudo apt install -y nodejs npm"
  echo "  Fedora:         sudo dnf install -y nodejs"
  echo "  macOS (brew):   brew install node"
  echo "  Or download it: https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First-time setup: installing components (about a minute)..."
  npm install
  echo
fi

if ! command -v java >/dev/null 2>&1; then
  echo "NOTE: Java was not found. The dashboard opens fine, but running a"
  echo "      Minecraft server needs Java (e.g. 'sudo apt install openjdk-21-jre-headless')."
  echo
fi

echo "Starting the dashboard at http://localhost:8080"
echo "(Keep this window open while you play. Press Ctrl+C to stop.)"
echo

# open the browser shortly after the server comes up
( sleep 2; (xdg-open http://localhost:8080 || open http://localhost:8080) >/dev/null 2>&1 ) &

node server/index.js
