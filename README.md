<div align="center">

# 🟩 ChunkDeck

**Host and manage your own Minecraft server from your browser — free, open source, no monthly fees.**

A complete web control panel for a Minecraft server: live console, one-click start/stop, player management, backups, scheduling, plugins, and one-click "play with friends" over the internet. Vanilla JS + Express, no build step.

[Download](https://github.com/kinkoo777/MinecraftServerDashboard/archive/refs/heads/main.zip) · [Website](https://kinkoo777.github.io/MinecraftServerDashboard/) · [Report a bug](https://github.com/kinkoo777/MinecraftServerDashboard/issues)

</div>

> [!IMPORTANT]
> **Windows may warn you the first time you run it.** Because this is free, open-source software that isn't *code-signed*, Windows Security / SmartScreen can say **"Windows protected your PC"** or flag it as unsafe. It is **not a virus** — every line is public here on GitHub. To allow it: right-click the downloaded **`.zip` → Properties → tick ☑ Unblock** before extracting, or if you see the popup, click **More info → Run anyway**. Full details in [Quick install](#-quick-install-normal-people-version) and [Troubleshooting](#-troubleshooting) below.

---

## Contents

- [Quick install](#-quick-install-normal-people-version)
- [Tutorial: your first server in 5 minutes](#-tutorial-your-first-server-in-5-minutes)
- [Playing with friends](#-playing-with-friends)
- [Backups & schedules](#-backups--schedules)
- [Plugins & mods](#-plugins--mods)
- [Keeping it up to date](#-keeping-it-up-to-date)
- [Changelog](#-changelog)
- [Features](#-features)
- [Troubleshooting](#-troubleshooting)
- [Security](#-security)
- [Configuration](#-configuration)
- [Run manually / as a service](#-run-manually-or-as-a-service)

---

## 🚀 Quick install (normal people version)

1. **[Download the ZIP](https://github.com/kinkoo777/MinecraftServerDashboard/archive/refs/heads/main.zip)**.
2. Open your **Downloads** folder, right-click the ZIP, and choose **Extract All** / **Unzip**.
3. Open the extracted folder.
4. Start the launcher:
   - **Windows:** double-click **`start.bat`**
   - **macOS:** open Terminal in the folder and run **`./start.sh`**
   - **Linux:** open a terminal in the folder and run **`./start.sh`**
5. Keep the launcher window open. Your browser opens at **http://localhost:8080**.
6. In the browser, create a password, download Paper or Vanilla, accept the EULA, and press **Start**.

The launcher installs Node.js if it's missing, and the dashboard downloads Java by itself the first time it starts (into a `java/` folder next to it — nothing is installed system-wide). If macOS says Node.js is missing, install [Homebrew](https://brew.sh), then run `./start.sh` again:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### ⚠️ Windows Security says "not safe" or blocks it?

That's normal for free open-source apps that are not *code-signed*. Windows Security / SmartScreen may say **"Windows protected your PC"**, **"unknown publisher"**, or even quarantine one of the launcher files. It is **not a virus**: this is open source and you can read every line on GitHub. To allow it:

- **Best:** right-click the downloaded **`.zip` → Properties → tick ☑ Unblock → OK**, *then* extract and run. This clears the warning from every file at once.
- **If you see "Windows protected your PC":** click **More info → Run anyway**.
- **If Windows quarantined a file:** open **Windows Security → Protection history**, choose the ChunkDeck item, then click **Allow** or **Restore**. After that, extract the ZIP again.
- **If your browser blocked the download:** click **Keep / Keep anyway**.

---

## 📖 Tutorial: your first server in 5 minutes

This walks you all the way from "just downloaded it" to "playing with friends."

### 1. Start the dashboard
Run `start.bat` (Windows) or `./start.sh` (Linux/macOS). A browser tab opens at `http://localhost:8080`. Keep the little launcher window open — closing it stops the dashboard.

### 2. Create your password
On the very first visit it asks you to **create a password**. This protects your dashboard so only you can control the server. Pick something memorable (you'll use it every time you log in).

### 3. Download a server
Go to **Settings → Server software**. Choose:
- **Paper** — recommended. Fast, and supports plugins.
- **Vanilla** — the pure Mojang server.

Pick a version (the latest is fine) and click **Download**. The dashboard fetches it for you — no hunting for files.

### 4. Accept the EULA
Back on the **Dashboard** page you'll see a notice asking you to accept the Minecraft **EULA** (Mojang requires this). Click **Accept EULA**.

### 5. Press Start
Click the green **Start** button. The first launch takes a minute while it generates the world — watch it happen live on the **Console** page. When you see `Done!`, your server is running. 🎉

### 6. Join your own server
Open Minecraft → **Multiplayer → Add Server**, and use:
- **On the same PC:** `localhost`
- **Another device on your home Wi-Fi:** your computer's local IP (e.g. `192.168.1.20`)

### 7. Make it your own
On the **Settings** page, edit `server.properties` — MOTD, difficulty, max players, gamemode, PVP and more, each with a proper toggle/dropdown. Or apply a one-click **preset** (Survival, Creative, Hardcore, Peaceful, Anarchy). Click **Save**, then restart the server to apply.

That's it — you have a working server. Next, invite friends. 👇

---

## 🌍 Playing with friends

You don't need to mess with your router. Open the **Play Online** tab:

1. Click **Enable internet access**. The dashboard downloads the free [playit.gg](https://playit.gg) agent for you.
2. Click **Sign in & approve** — a playit.gg page opens. Sign in or **continue as guest**, then click **Allow**. That's the only step you do by hand.
3. The dashboard does the rest automatically: it claims the agent, creates a **Minecraft** tunnel and shows your public **address** (something like `yourname.gl.joinmc.link`). Click **Copy** and send it to friends.
4. Friends add that address in Minecraft → Multiplayer → Add Server, and they're in.

After the first time the setup is remembered, so it's a single click to go online again. No port forwarding, no static IP, no networking knowledge required.

> On a home network you can also just share your public IP and forward port `25565` — but playit is the easy path.

---

## 💾 Backups & schedules

**Make a backup any time:** go to **World → Create backup**. It zips your world; download or restore it later from the same page. Old backups are pruned automatically (keep the newest N, set in Settings).

**Automate it:** on the **Schedules** page, add tasks that run daily or on an interval:
- **Backup world** every night at 4:00
- **Restart server** every 6 hours (with a colored in-game warning: "Server restart in 5 minutes!")
- **Run command** or **Announce** a message on a timer
- Tick **only when empty** so restarts never interrupt players

Save your whole setup as a **preset** to reuse later, or start from a built-in bundle (Daily maintenance, Frequent backups, Public server, Low-maintenance) — apply one to add to your current schedules or replace them outright.

You can also get a **Discord** message or **phone push (ntfy)** when the server starts, crashes, a player joins, or a backup finishes — set these in **Settings**.

---

## 🧩 Plugins & mods

On the **Content** page you can **search Modrinth and install** plugins, mods and full **modpacks** with one click, browse project details (description, gallery, versions) first, or upload your own `.jar` files. Plugins need a **Paper** server; mods need **Fabric**, **NeoForge** or **Forge**. A modpack install sets up the matching loader server, mods and config overrides together — just press **Start** when it finishes. For individual plugins/mods, restart the server after adding them.

---

## 🔄 Keeping it up to date

ChunkDeck updates itself — no re-downloading. Go to **Settings → Updates** and click **Check for updates**. If a newer version has been published, click **Update** and the dashboard downloads the latest release from GitHub and applies it **in place**.

Your data is never touched: your world (`mc-server/`), backups, `config.json`, schedules, logs and tunnel setup are all preserved, and a snapshot of the replaced files is saved under `update-backups/` in case you want to roll back. After an update, restart the launcher window so the new version runs.

---

## 📋 Changelog

### v1.3.3
- **Assistant: twice as many tools** — it can now read and search saved logs and crash reports, check for updates, see how players connect, look at the computer's memory and disk, list and remove plugins and mods, search and manage config files, change dashboard settings, and more (57 tools)
- **Assistant memory** — it keeps short notes you tell it and knows them in every chat; see and delete them in the assistant settings
- **Undo** — changes it makes to files and settings can be put back ("undo the last change")
- **See the change before you approve** — the approval card shows the old and new lines
- **One approval for a big job** — it shows the whole plan once; dangerous steps still ask one by one
- **Daily summary** — a short notification once a day about the last 24 hours
- **Ask it from inside Minecraft** — type `!ai` in game chat (only your own player name is answered)
- **Watches more by itself** — failed backups, a nearly full disk, and players who keep getting disconnected
- **Suggestions that fit the page** in the floating assistant
- **Fixed:** dropdown arrows sat too close to the edge

### v1.3.1
- **Free models that switch by themselves** — with OpenRouter the assistant now uses **All free models (automatic)** by default: each message goes to a free model that is available, so a busy or refused model no longer stops the chat
- **Several AI services ready at once** — every service you set up is remembered (green dot in the settings), and with **Switch to another service** on, the assistant moves to the next one when a free limit runs out
- **More free services** — Cerebras, Mistral and NVIDIA join the list
- **Model picker** — the model is chosen from a real dropdown that loads the service's models by itself
- **Fixed:** switching to another AI service could lose the key of the one in use
- **Fixed:** the Send button in the assistant sits level with the message box

### v1.3.0
- **Crash explainer** — when the server fails to start, the dashboard says why in plain words (missing mod, mod for the wrong Minecraft version, port in use, out of memory, world in use, client-only mod…) and offers a fix where it can: **Install missing mods** downloads them from Modrinth. Auto-restart no longer retries a start that can't succeed
- **Cleaner player window** — the essentials on top, with Manage, Inventory, Statistics and Admin notes as fold-out sections that remember whether you left them open
- **Message a single player** — the on-screen message can go to everyone or to one player, from the Dashboard's new **Message to players** card or from the player window
- **Assistant** — a chat page where an AI model operates the dashboard for you ("who's online?", "back up the world", "why did it crash?", "make it day"). It checks status and the console, starts/stops the server, runs commands, manages players, sends messages, makes and restores backups, manages schedules, edits config files, changes server settings, and installs plugins, mods, modpacks or different server software — asking before anything that changes your server (with an "always allow" for the harmless kinds). Answers are written out live, chats are kept, a floating button opens it from any page, and it can look into crashes and lag by itself and notify you. Works with OpenRouter (one-click sign-in, includes free models), Groq, Google Gemini, DeepSeek, Claude, OpenAI, local models (Ollama, LM Studio) or any OpenAI-compatible service
- **Compact message card** — who, style and text on one row; styles are picked from a dropdown
- **Crashes from outside** — a server killed by the system (out of memory, task manager) now counts as a crash, so auto-restart and notifications react to it
- **Message styles** — choose where a message appears (big or small in the middle, above the hotbar, or in chat), its colour and how long it stays; ready-made presets plus your own, built in a small window with a live preview
- **Notifications card** — Settings has a guided phone setup (ntfy app, QR code, test button) next to Discord, and switches for which events you hear about (start/stop, crashes, players, backups, daily report)
- **Give item picker** — search items by name and pick from a grid with pictures instead of typing ids
- **Console helper** — while typing a command the console shows what it expects and offers completions for commands, players, items and fixed choices; Tab fills one in
- **Inventory icons** — blocks, beds, chests, heads, spawn eggs and other items that used to show as text now have pictures
- **Modpack list** — Forge/NeoForge/Fabric modpacks are no longer limited to your server's Minecraft version (a modpack brings its own); pick a version in the filter if you want one

### v1.2.1
- **On-screen messages** — type a message on the Dashboard and press **Show to all**: it appears in the middle of every player's screen (a title, not a chat line)

### v1.2.0
- **Java installs itself** — if Java is missing or too old for your Minecraft version, the dashboard downloads the right one into its own `java/` folder on first start and whenever a server needs a newer one. No admin rights, Homebrew or PATH setup; Minecraft 26.x now correctly gets Java 25
- **Folder uploads** — the Files page has an **Upload folder** button and accepts drag-and-drop of files or whole folders, keeping the folder structure
- **Remote access link survives restarts** — the Cloudflare tunnel keeps running when the dashboard is closed, so the link stays the same until you turn it off or restart the computer
- **Modded server fixes** — online players now show on Forge 26.x, "Quick setup" no longer reappears after installing Forge/NeoForge, worlds created on Paper 26.x load on Forge/NeoForge/Fabric/Vanilla, and a server that can't load its world is stopped instead of hanging on "Starting up…"
- **Settings polish** — the server software picker opens on what's actually installed, with less text; the dashboard status pill matches the buttons next to it

See [GitHub Releases](https://github.com/kinkoo777/MinecraftServerDashboard/releases) for older versions.

---

## ✨ Features

- **One-click controls** — start / stop / restart, with **auto-restart on crash**
- **Live console** — real-time log over WebSocket, command input with history, saved logs of past runs
- **Server downloader & update checker** — install Paper, Vanilla, Fabric, NeoForge or Forge in a click; get told when a newer build exists
- **Content hub** — browse, filter and search Modrinth for plugins, mods and modpacks with project details (description, gallery, versions) and one-click install, including full **modpack** installs that set up the loader server, mods and overrides together
- **Self-updating dashboard** — one-click in-place updates from GitHub Releases, keeping your world, config and backups intact
- **Crash explainer** — plain-language reason when the server won't start, with one-click fixes such as installing missing mods
- **Assistant** — tell an AI model what you want in plain words and it operates the dashboard, asking before it changes anything; bring your own model (Claude, OpenAI, free tiers, or a local one)
- **Players** — online / whitelist / ops / banned lists, an **inventory viewer** with real item icons, playtime/deaths/kills **stats**, a **leaderboard**, admin **notes**, and actions: op, whitelist, ban, kick, heal, feed, kill, gamemode, teleport, give items (whitelist/op/ban editing works even while the server is stopped)
- **Settings** — Java/RAM options, full `server.properties` editor with typed controls and presets, config export/import
- **Backups** — one-click zip backups with retention, restore, download
- **Schedules** — daily/interval restart, backup, command and announcement tasks with in-game warnings, plus **presets** to save your own schedule bundle or start from a built-in one
- **Play Online** — one-click free internet access via playit.gg
- **History** — daily reports (peak/avg players, uptime, crashes, who played) with per-hour graphs, kept 120 days
- **Multiple server profiles** — run survival, creative, modded… and switch between them
- **Notifications** — Discord webhook and/or ntfy.sh phone push
- **Files** — browse, upload, edit and delete server files in the browser
- Dark & light theme, responsive from phones to 4K, installable as a phone app (PWA), password-protected

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| **Windows Security says "not safe", quarantines a file, or shows "Windows protected your PC"** | Unsigned open-source software — it's safe. Right-click the `.zip` → Properties → **Unblock** before extracting. If Windows quarantined it, open **Windows Security → Protection history** and choose **Allow** / **Restore**. If SmartScreen appears, click **More info → Run anyway**. |
| **Browser didn't open / "can't reach localhost:8080"** | Make sure the launcher window is still open. Then visit `http://localhost:8080` manually. |
| **"Server jar not found"** | Download one from **Settings → Server software**, or drop a `server.jar` into the `mc-server/` folder. |
| **Server won't start, log mentions Java** | The dashboard downloads the Java your Minecraft version needs when you press **Start** — check the Console for a download error (usually no internet), then press Start again. To use your own Java, set **Settings → Java path**. |
| **Friends can't connect** | Use the **Play Online** tab (playit) — it avoids router setup entirely. |
| **Forgot your dashboard password** | Delete `config.json` and restart — you'll be asked to set a new one. (Your world and settings stay; only the password resets, along with launch options.) |
| **Port 8080 already in use** | Change `dashboardPort` in `config.json` and restart. |

---

## 🔒 Security

The dashboard is **password-protected** (scrypt-hashed) and all API/WebSocket traffic is session-checked, with rate-limited login attempts (per-IP **and** a global cap, so a hidden client IP behind a tunnel can't bypass it). Sessions persist across restarts, with a **"keep me signed in"** choice at login. You can also turn on **two-factor authentication (2FA)** in **Settings → Two-factor authentication** — a 6-digit code from any authenticator app, so a stolen password alone isn't enough. The logged-in file manager has full access to the server folder, so keep your password private.

### 🌐 Exposing the dashboard over the internet — do it safely

The dashboard serves plain **HTTP**, which is fine on your home network. But a plain **playit.gg tunnel is raw TCP**, so if you tunnel the dashboard directly your password and session cookie travel **unencrypted** across the internet (the login screen warns you when it detects this). Before exposing it:

1. **Turn on 2FA** (Settings → Two-factor authentication). Quickest win — a sniffed or guessed password no longer gets someone in.
2. **Put it behind HTTPS.** Best options:
   - **Caddy** (automatic HTTPS, one line) — point a domain at your machine and:
     ```
     your-domain.com {
         reverse_proxy localhost:8080
     }
     ```
   - **Cloudflare Tunnel** (`cloudflared`) — free, gives you an `https://` hostname with no open ports.
   - The dashboard already trusts one proxy hop, so `https://` and the `Secure` cookie flag work automatically behind either.
3. **Or skip exposure entirely** and use a **VPN** like [Tailscale](https://tailscale.com) — then the dashboard is only reachable from your own devices.

Avoid exposing port 8080 directly over plain HTTP.

---

## ⚙️ Configuration

`config.json` is created automatically on first run. You normally never edit it by hand — use the Settings page — but here's what it holds:

| Key | Default | Meaning |
|---|---|---|
| `serverDir` | `mc-server` | server folder, relative to the project |
| `jarFile` | `server.jar` | jar to launch |
| `javaPath` | `java` | path to the Java binary |
| `minRam` / `maxRam` | `1G` / `2G` | JVM heap size |
| `jvmArgs` | _empty_ | extra JVM flags |
| `dashboardPort` | `8080` | web UI port |
| `autoRestart` | `true` | restart automatically after a crash |
| `backupKeep` | `10` | newest backups to keep (0 = unlimited) |
| `discordWebhook` / `ntfyTopic` | _empty_ | notification channels (empty = off) |

---

## 💻 Run manually, or as a service

**Manual (for developers):** requires [Node.js](https://nodejs.org) 18+ and Java (21+ for current Minecraft; the newest 1.21+/26.x builds need Java 25). If Java is missing or too old, the dashboard downloads a suitable Temurin runtime into `java/` on first start.

```bash
npm install
npm start
# then open http://localhost:8080
```

**Linux service (keeps running in the background):**

```ini
# /etc/systemd/system/chunkdeck.service
[Unit]
Description=ChunkDeck
After=network.target

[Service]
WorkingDirectory=/opt/MinecraftServerDashboard
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
User=minecraft

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now chunkdeck
```

---

<div align="center">

[MIT licensed](LICENSE) · made for the community · not affiliated with Mojang or Microsoft.

</div>
