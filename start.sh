#!/usr/bin/env bash
# ChunkDeck launcher for Linux & macOS - run: ./start.sh
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "          ChunkDeck - Launcher"
echo "============================================"
echo

OS="$(uname -s)"

open_url() {
  if [ "$OS" = "Darwin" ]; then
    open "$1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1 || true
  fi
}

install_node() {
  if [ "$OS" = "Darwin" ]; then
    echo "Node.js is needed to run the dashboard, but it is not installed yet."
    echo
    if command -v brew >/dev/null 2>&1; then
      echo "Installing Node.js with Homebrew..."
      brew install node || return 1
    else
      echo "Homebrew is needed to set things up automatically on macOS, but it isn't installed."
      echo "Install Homebrew by pasting this into Terminal, then run ./start.sh again:"
      echo
      echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      echo
      echo "(Opening https://brew.sh for instructions. You can also install Node.js manually from nodejs.org.)"
      open_url "https://brew.sh"
      return 1
    fi
  elif command -v apt-get >/dev/null 2>&1; then
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
    echo "Could not auto-install Node.js."
    echo "Install it from https://nodejs.org, then run ./start.sh again."
    open_url "https://nodejs.org/en/download/prebuilt-installer"
    return 1
  fi
}

# ---- Node.js (required to run the dashboard) ----
if ! command -v node >/dev/null 2>&1; then
  install_node || exit 1
  hash -r 2>/dev/null || true
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is still not available. Please install it, then run ./start.sh again."
    exit 1
  fi
  echo
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found."
  echo "Install the Node.js LTS package from https://nodejs.org, then run ./start.sh again."
  open_url "https://nodejs.org/en/download/prebuilt-installer"
  exit 1
fi

# Java is not installed here: the dashboard downloads a suitable Java by itself
# (into ./java) the first time it starts, and whenever a server needs a newer one.

# ---- First-run dependencies ----
if [ ! -d node_modules ]; then
  echo "First-time setup: installing components (about a minute)..."
  npm install || exit 1
  echo
fi

# ---- Auto-fix known dependency vulnerabilities, if any ----
echo "Checking dependencies for security fixes..."
npm audit fix 2>/dev/null || true
echo

echo "Starting the dashboard at http://localhost:8080"
echo "(Keep this window open while you play. Press Ctrl+C to stop.)"
echo

# Open the browser shortly after the server comes up.
( sleep 2; open_url "http://localhost:8080" ) &

node server/index.js
