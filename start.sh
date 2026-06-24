#!/usr/bin/env bash
# ChunkDeck launcher for Linux & macOS - run: ./start.sh
cd "$(dirname "$0")" || exit 1

echo "============================================"
echo "          ChunkDeck - Launcher"
echo "============================================"
echo

OS="$(uname -s)"

java_major() {
  local v
  v=$(java -version 2>&1 | head -1 | sed 's/.*version "\([0-9][0-9.]*\)".*/\1/')
  case "$v" in
    1.*) printf '%s' "$v" | cut -d. -f2 ;;
    *)   printf '%s' "$v" | cut -d. -f1 ;;
  esac
}

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

install_java() {
  if [ "$OS" = "Darwin" ]; then
    echo "Java is needed to run the Minecraft server, but it is not installed yet."
    echo
    if command -v brew >/dev/null 2>&1; then
      echo "Installing Java with Homebrew..."
      brew install --cask temurin || return 1
    else
      echo "Homebrew is needed to install Java automatically on macOS, but it isn't installed."
      echo "Install Homebrew by pasting this into Terminal, then run ./start.sh again:"
      echo
      echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
      echo
      echo "(Opening https://brew.sh. You can also install Java 21 manually from adoptium.net.)"
      open_url "https://brew.sh"
      return 1
    fi
  elif command -v apt-get >/dev/null 2>&1; then
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
    echo "Could not auto-install Java."
    echo "Install Java 21 from https://adoptium.net, then run ./start.sh again."
    open_url "https://adoptium.net/temurin/releases/?version=21"
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

# ---- Java: check for version 21+ (needed to run the Minecraft server) ----
JAVA_OK=0
if ! command -v java >/dev/null 2>&1; then
  install_java || true
  hash -r 2>/dev/null || true
  if ! command -v java >/dev/null 2>&1; then
    echo "Java is still not available."
    echo "The dashboard will open, but the Minecraft server cannot start until Java 21 is installed."
    echo
  else
    JAVA_OK=1
    echo
  fi
else
  JAVA_MAJOR=$(java_major)
  if [ -n "$JAVA_MAJOR" ] && [ "$JAVA_MAJOR" -lt 21 ] 2>/dev/null; then
    echo "Java $JAVA_MAJOR is installed, but Minecraft needs Java 21 or newer. Upgrading..."
    echo
    install_java || true
    hash -r 2>/dev/null || true
    JAVA_MAJOR=$(java_major)
    echo
  fi
  JAVA_OK=1
fi

# ---- First-run dependencies ----
if [ ! -d node_modules ]; then
  echo "First-time setup: installing components (about a minute)..."
  npm install || exit 1
  echo
fi

echo "Starting the dashboard at http://localhost:8080"
echo "(Keep this window open while you play. Press Ctrl+C to stop.)"
echo

# Open the browser shortly after the server comes up.
( sleep 2; open_url "http://localhost:8080" ) &

node server/index.js
