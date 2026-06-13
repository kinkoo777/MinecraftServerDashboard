# MC Dashboard

A minimalistic web dashboard for managing a Minecraft server — start/stop, live console, players, settings, world backups, file manager, plugins and scheduled tasks. Vanilla JS + Express, no build step.

![icon](client/icon.svg)

## Features

- **Password login** — first run asks you to set a password; sessions, rate-limited attempts, protected WebSocket
- **Dashboard** — server status, start/stop/restart, live CPU/RAM/player stats, activity chart (players / CPU / RAM / TPS), recent players
- **Server jar downloader** — install Paper or Vanilla (any recent version) with one click, straight from the official APIs
- **Crash auto-restart** — automatic restart after a crash (up to 3 quick retries), with the console log of every run saved to `console-logs/`
- **Discord notifications** — optional webhook for start/stop/crash, player joins/leaves and finished backups
- **Console** — real-time log stream over WebSocket, command input with history, downloadable logs of past runs
- **Players** — online/whitelist/ops/banned lists; click any player for details, inventory viewer (reads playerdata NBT, works offline), playtime/deaths/kills statistics, and actions: op, whitelist, ban, kick, heal, feed, kill, gamemode, teleport, give items. Whitelist/op/ban editing works even while the server is stopped
- **Settings** — Java/RAM launch options, full `server.properties` editor with grouped typed controls, config export/import
- **World** — seed/size info, one-click zip backups with retention, restore, download
- **Files** — file browser with upload, rename, delete and inline text editing
- **Plugins/Mods** — manage `.jar` files, search & install directly from Modrinth
- **Schedules** — daily or interval tasks (restart / backup / command / announce), colored in-game warnings ("restart in 5 minutes"), "only when no players online" option
- **Play Online** — one-click internet access via [playit.gg](https://playit.gg) so friends can join with no port forwarding
- **History** — daily reports (peak/avg players, uptime, crashes, backups, who played) with per-hour Players/CPU/RAM/TPS graphs; kept 120 days
- **Multiple server profiles** — run several independent servers (survival, creative, …) from one dashboard and switch between them
- **Notifications** — Discord webhook and/or ntfy.sh phone push for start/stop/crash, joins, backups and daily reports
- **Server jar downloader & update checker** — install Paper/Vanilla and get notified when a newer build exists
- **Players** — inventory viewer, statistics, playtime leaderboard, admin notes, and actions (op/ban/kick/heal/teleport/give/gamemode…)
- **server.properties presets** — one-click survival / creative / hardcore / peaceful / anarchy bundles
- Dark & light theme, responsive from phones to 4K, installable as a PWA

## Easiest way to start (no commands)

1. **[Download the ZIP](https://github.com/kinkoo777/MinecraftServerDashboard/archive/refs/heads/main.zip)** and unzip it anywhere.
2. **Windows:** double-click **`start.bat`**. **Linux/macOS:** run **`./start.sh`**.
3. The launcher installs what it needs and opens the dashboard at **http://localhost:8080**.
4. Set a password, click **Download** to grab a server jar (Paper/Vanilla), **Accept EULA**, then **Start**. Done.

The launcher will offer to install Node.js for you if it's missing. To actually run a Minecraft server you also need Java — the dashboard tells you if it's missing.

## Start manually (developers)

Requirements: [Node.js](https://nodejs.org) 18+, Java 17+ (21 for recent Minecraft versions).

```bash
npm install
npm start
```

Then open http://localhost:8080.

Works on Windows and Linux. To run as a service on Linux:

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

## Security

The dashboard requires a password (set on first run) and all API/WebSocket traffic is session-protected. Still, it is plain HTTP — for access over the internet put it behind HTTPS (a reverse proxy like Caddy, or a VPN such as Tailscale). The logged-in file manager has full access to the server folder, so treat the password accordingly.

## Configuration

`config.json` is created on first run:

| Key | Default | Meaning |
|---|---|---|
| `serverDir` | `mc-server` | server folder, relative to the project |
| `jarFile` | `server.jar` | jar to launch |
| `javaPath` | `java` | path to the Java binary |
| `minRam` / `maxRam` | `1G` / `2G` | JVM heap |
| `jvmArgs` | _empty_ | extra JVM flags |
| `dashboardPort` | `8080` | web UI port |
| `autoRestart` | `true` | restart automatically after a crash |
| `backupKeep` | `10` | newest backups to keep (0 = unlimited) |
| `discordWebhook` | _empty_ | Discord notifications (empty = off) |
