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

The launcher tries to install what it needs automatically. If macOS says Node.js or Java is missing, install [Homebrew](https://brew.sh), then run `./start.sh` again:

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

You can also get a **Discord** message or **phone push (ntfy)** when the server starts, crashes, a player joins, or a backup finishes — set these in **Settings**.

---

## 🧩 Plugins & mods

On the **Plugins** page you can **search Modrinth and install** plugins/mods with one click, or upload your own `.jar` files. Plugins need a **Paper** server; mods need **Fabric** or **Forge**. Restart the server after adding them.

---

## 🔄 Keeping it up to date

ChunkDeck updates itself — no re-downloading. Go to **Settings → Updates** and click **Check for updates**. If a newer version has been published, click **Update** and the dashboard downloads the latest release from GitHub and applies it **in place**.

Your data is never touched: your world (`mc-server/`), backups, `config.json`, schedules, logs and tunnel setup are all preserved, and a snapshot of the replaced files is saved under `update-backups/` in case you want to roll back. After an update, restart the launcher window so the new version runs.

---

## ✨ Features

- **One-click controls** — start / stop / restart, with **auto-restart on crash**
- **Live console** — real-time log over WebSocket, command input with history, saved logs of past runs
- **Server downloader & update checker** — install Paper/Vanilla in a click; get told when a newer build exists
- **Self-updating dashboard** — one-click in-place updates from GitHub Releases, keeping your world, config and backups intact
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
| **Windows Security says "not safe", quarantines a file, or shows "Windows protected your PC"** | Unsigned open-source software — it's safe. Right-click the `.zip` → Properties → **Unblock** before extracting. If Windows quarantined it, open **Windows Security → Protection history** and choose **Allow** / **Restore**. If SmartScreen appears, click **More info → Run anyway**. |
| **Browser didn't open / "can't reach localhost:8080"** | Make sure the launcher window is still open. Then visit `http://localhost:8080` manually. |
| **"Server jar not found"** | Download one from **Settings → Server jar**, or drop a `server.jar` into the `mc-server/` folder. |
| **Server won't start, log mentions Java** | Java isn't installed or wasn't found. Re-run the launcher (it installs Java), then try again. |
| **Pressed Start right after the launcher installed Java, and it failed** | Close the launcher window and run `start.bat` / `start.sh` again so the new Java is detected. |
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

**Manual (for developers):** requires [Node.js](https://nodejs.org) 18+ and Java (21+ for current Minecraft; the newest 1.21+/26.x builds need Java 25). The one-click launchers install a suitable Java for you.

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
