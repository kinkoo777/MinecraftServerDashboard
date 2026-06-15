<div align="center">

# 🟩 MC Dashboard

**Host and manage your own Minecraft server from your browser — free, open source, no monthly fees.**

A complete web control panel for a Minecraft server: live console, one-click start/stop, player management, backups, scheduling, plugins, and one-click "play with friends" over the internet. Vanilla JS + Express, no build step.

[Download](https://github.com/kinkoo777/MinecraftServerDashboard/archive/refs/heads/main.zip) · [Website](https://kinkoo777.github.io/MinecraftServerDashboard/) · [Report a bug](https://github.com/kinkoo777/MinecraftServerDashboard/issues)

</div>

---

## Contents

- [Quick install (no commands)](#-quick-install-no-commands)
- [Tutorial: your first server in 5 minutes](#-tutorial-your-first-server-in-5-minutes)
- [Playing with friends](#-playing-with-friends)
- [Backups & schedules](#-backups--schedules)
- [Plugins & mods](#-plugins--mods)
- [Features](#-features)
- [Troubleshooting](#-troubleshooting)
- [Security](#-security)
- [Configuration](#-configuration)
- [Run manually / as a service](#-run-manually-or-as-a-service)

---

## 🚀 Quick install (no commands)

1. **[Download the ZIP](https://github.com/kinkoo777/MinecraftServerDashboard/archive/refs/heads/main.zip)** and unzip it anywhere (e.g. your Desktop).
2. Open the folder and:
   - **Windows:** double-click **`start.bat`**
   - **Linux / macOS:** run **`./start.sh`** in a terminal
3. The launcher installs everything it needs — **Node.js and Java included** — and opens the dashboard at **http://localhost:8080**.

That's the whole install. No commands to type. Continue with the tutorial below.

> The launcher uses winget on Windows, or apt/dnf/pacman/zypper/Homebrew on Linux & macOS, to install Node.js and Java automatically if they're missing. If it ever can't, it opens the right download page for you.

### ⚠️ Windows says "not safe" or blocks it?

That's normal — it's **Windows SmartScreen** warning about software that isn't *code-signed* (signing certificates cost hundreds of dollars/year, so most free open-source tools trigger this). It is **not a virus**: this is open source and you can read every line on GitHub. To allow it:

- **Best:** right-click the downloaded **`.zip` → Properties → tick ☑ Unblock → OK**, *then* extract and run. This clears the warning from every file at once.
- **If you see "Windows protected your PC":** click **More info → Run anyway**.
- **If your browser blocked the download:** click **Keep / Keep anyway**.

---

## 📖 Tutorial: your first server in 5 minutes

This walks you all the way from "just downloaded it" to "playing with friends."

### 1. Start the dashboard
Run `start.bat` (Windows) or `./start.sh` (Linux/macOS). A browser tab opens at `http://localhost:8080`. Keep the little launcher window open — closing it stops the dashboard.

### 2. Create your password
On the very first visit it asks you to **create a password**. This protects your dashboard so only you can control the server. Pick something memorable (you'll use it every time you log in).

### 3. Download a server
Go to **Settings → Server jar**. Choose:
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

1. Click **Enable internet access**. The dashboard downloads and runs the free [playit.gg](https://playit.gg) agent for you.
2. Click the **Finish setup** link, sign in to playit.gg (free), and add a **Minecraft Java** tunnel pointing to `127.0.0.1:25565`.
3. The page shows a public **address** (something like `yourname.craft.playit.gg`). Click **Copy** and send it to your friends.
4. Friends add that address in Minecraft → Multiplayer → Add Server, and they're in.

No port forwarding, no static IP, no networking knowledge required.

> On a home network you can also just share your public IP and forward port `25565` — but playit is the easy path.

---

## 💾 Backups & schedules

**Make a backup any time:** go to **World → Create backup**. It zips your world; download or restore it later from the same page. Old backups are pruned automatically (keep the newest N, set in Settings).

**Automate it:** on the **Schedules** page, add tasks that run daily or on an interval:
- **Backup world** every night at 4:00
- **Restart server** every 6 hours (with a colored in-game warning: "Server restart in 5 minutes!")
- **Run command** or **Announce** a message on a timer
- Tick **only when empty** so restarts never interrupt players

You can also get a **Discord** message or **phone push (ntfy)** when the server starts, crashes, a player joins, or a backup finishes — set these in **Settings**.

---

## 🧩 Plugins & mods

On the **Plugins** page you can **search Modrinth and install** plugins/mods with one click, or upload your own `.jar` files. Plugins need a **Paper** server; mods need **Fabric** or **Forge**. Restart the server after adding them.

---

## ✨ Features

- **One-click controls** — start / stop / restart, with **auto-restart on crash**
- **Live console** — real-time log over WebSocket, command input with history, saved logs of past runs
- **Server downloader & update checker** — install Paper/Vanilla in a click; get told when a newer build exists
- **Players** — online / whitelist / ops / banned lists, an **inventory viewer** with real item icons, playtime/deaths/kills **stats**, a **leaderboard**, admin **notes**, and actions: op, whitelist, ban, kick, heal, feed, kill, gamemode, teleport, give items (whitelist/op/ban editing works even while the server is stopped)
- **Settings** — Java/RAM options, full `server.properties` editor with typed controls and presets, config export/import
- **Backups** — one-click zip backups with retention, restore, download
- **Schedules** — daily/interval restart, backup, command and announcement tasks with in-game warnings
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
| **Windows says "not safe" / "Windows protected your PC"** | Unsigned open-source software — it's safe. Right-click the `.zip` → Properties → **Unblock** before extracting, or click **More info → Run anyway**. See above. |
| **Browser didn't open / "can't reach localhost:8080"** | Make sure the launcher window is still open. Then visit `http://localhost:8080` manually. |
| **"Server jar not found"** | Download one from **Settings → Server jar**, or drop a `server.jar` into the `mc-server/` folder. |
| **Server won't start, log mentions Java** | Java isn't installed or wasn't found. Re-run the launcher (it installs Java), then try again. |
| **Pressed Start right after the launcher installed Java, and it failed** | Close the launcher window and run `start.bat` / `start.sh` again so the new Java is detected. |
| **Friends can't connect** | Use the **Play Online** tab (playit) — it avoids router setup entirely. |
| **Forgot your dashboard password** | Delete `config.json` and restart — you'll be asked to set a new one. (Your world and settings stay; only the password resets, along with launch options.) |
| **Port 8080 already in use** | Change `dashboardPort` in `config.json` and restart. |

---

## 🔒 Security

The dashboard is **password-protected** and all API/WebSocket traffic is session-checked, with rate-limited login attempts. It is, however, plain **HTTP** — fine on your home network. For access over the internet, put it behind **HTTPS** (a reverse proxy like Caddy) or a **VPN** (e.g. Tailscale) rather than exposing port 8080 directly. The logged-in file manager has full access to the server folder, so keep your password private.

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

**Manual (for developers):** requires [Node.js](https://nodejs.org) 18+ and Java 17+ (21 for recent Minecraft).

```bash
npm install
npm start
# then open http://localhost:8080
```

**Linux service (keeps running in the background):**

```ini
# /etc/systemd/system/mc-dashboard.service
[Unit]
Description=Minecraft Dashboard
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
sudo systemctl enable --now mc-dashboard
```

---

<div align="center">

[MIT licensed](LICENSE) · made for the community · not affiliated with Mojang or Microsoft.

</div>
