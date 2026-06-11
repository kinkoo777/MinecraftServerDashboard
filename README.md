# MC Dashboard

A minimalistic web dashboard for managing a Minecraft server — start/stop, live console, players, settings, world backups, file manager, plugins and scheduled tasks. Vanilla JS + Express, no build step.

![icon](client/icon.svg)

## Features

- **Dashboard** — server status, start/stop/restart, live CPU/RAM/player stats, activity chart, recent players
- **Console** — real-time log stream over WebSocket, command input with history
- **Players** — online/whitelist/ops/banned lists; click any player for details, actions (op, whitelist, ban, kick) and an **inventory viewer** (reads playerdata NBT directly, works for offline players too)
- **Settings** — Java/RAM launch options plus a full `server.properties` editor with grouped, typed controls
- **World** — seed/size info, one-click zip backups, restore, download
- **Files** — file browser with upload, rename, delete and inline text editing
- **Plugins/Mods** — manage `.jar` files in `plugins/` or `mods/`
- **Schedules** — daily automatic restarts, backups or commands
- Dark & light theme

## Quick start

Requirements: [Node.js](https://nodejs.org) 18+, Java 17+ (21 for recent Minecraft versions).

```bash
npm install
npm start
```

Open http://localhost:8080, drop a `server.jar` (e.g. [Paper](https://papermc.io/downloads) or vanilla) into the `mc-server/` folder — or upload it via the Files page — accept the EULA from the dashboard, and press Start.

Works on Windows and Linux. To run as a service on Linux see `systemd` example below.

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

## ⚠️ Security

The dashboard has **no authentication** and its file manager has full access to the server folder. Run it on a trusted LAN or behind a VPN (e.g. Tailscale). Do **not** expose port 8080 directly to the internet.

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
