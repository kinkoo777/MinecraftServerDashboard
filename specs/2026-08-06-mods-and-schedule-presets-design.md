# ChunkDeck 1.1.0 — Modded Servers, Content Hub, Modpacks & Schedule Presets

- **Date:** 2026-08-06
- **Status:** Approved design, pending implementation plan
- **Owner:** vgott
- **Note:** lives in `specs/` because `/docs/` is gitignored in this repo (marketing site moved to MinecraftServerDashboardWeb).

## Context & Goals

ChunkDeck (Node/Express + vanilla JS SPA, no build step, no test framework) currently:

- installs only **Paper/Vanilla** server jars (`server/utils/jars.js`), launched as `java -Xms -Xmx [jvmArgs] -jar server.jar nogui` (`server/minecraft.js`);
- has a combined **Plugins & Mods** page (`client/js/plugins.js`) with a basic Modrinth search (12 results, no filters/pagination/details, newest-version installs only) backed by `server/routes/modrinth.js` (search / check-updates by SHA1 / install);
- has **Schedules** (daily/interval/once/cron × restart/backup/command/announce, warnings, only-when-empty) with no presets.

This release makes mods a first-class, end-to-end feature and adds schedule preset bundles:

1. **Modded server support** — Fabric, NeoForge, Forge as installable server types with a working launch path.
2. **Content hub** — the Plugins page becomes a full browse experience (tabs Plugins/Mods/Modpacks, search, sort, filters, pagination, details modal with version picker).
3. **Modpack installs** — one-click Modrinth `.mrpack` install (server + mods + configs).
4. **Schedule presets** — built-in multi-task bundles plus user-saved bundles.

**Non-goals (future work):** Quilt support, loader-version pickers (loader build is auto-latest), modpack *updates* (reinstall is the path), preset export/import, CurseForge sources, multi-Java management.

## 1. Modded Server Support

### 1.1 Server types & version sources

| Type | Version list source | Artifact | Launch |
|---|---|---|---|
| `fabric` | `meta.fabricmc.net/v2/versions/game` (stable), loader from `/v2/versions/loader`, installer version from `/v2/versions/installer` | Ready-made server launcher jar: `meta.fabricmc.net/v2/versions/loader/<game>/<loader>/<installer>/server/jar` → saved as `server.jar` | jar (unchanged) |
| `neoforge` | `maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`; match MC `1.X.Y` → versions prefixed `X.Y.` | Official installer `maven.neoforged.net/releases/net/neoforged/neoforge/<v>/neoforge-<v>-installer.jar`, run once | argfile |
| `forge` | `files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json` (recommended, else latest, per MC version) | Official installer `maven.minecraftforge.net/net/minecraftforge/forge/<mc>-<fv>/forge-<mc>-<fv>-installer.jar`, run once | argfile (1.17+) or jar (legacy ≤1.16) |

- Installer run: `java -jar <installer> --installServer <serverDir>`, stdout/stderr streamed to the dashboard console via `mc.pushLog`, installer + its `.log` deleted afterwards. (If `--installServer` is rejected by a NeoForge build, retry `--install-server`.)
- Forge/NeoForge generate argfiles: `libraries/net/neoforged/neoforge/<v>/` or `libraries/net/minecraftforge/forge/<mc>-<fv>/` containing `win_args.txt` / `unix_args.txt`.
- All downloads restricted to the hosts named above (same allow-list style as the existing Modrinth/Paper code). Installer download cap 100 MB.

### 1.2 Config format

`installedJar` string gains new forms (existing: `paper <mc> <build>`, `vanilla <mc>`):

- `fabric <mc> <loaderVersion>`
- `neoforge <mc> <neoVersion>`
- `forge <mc> <forgeVersion>`

`jarFile` stays `server.jar` for fabric; it is ignored at launch for argfile types. No new config keys are needed for launching — launch details are derived from `installedJar` + filesystem at start time (resilient to manual folder surgery). The only new config key in this release is `modpackName` (§4.1.7, display-only).

### 1.3 Launch abstraction (`server/minecraft.js`)

At `start()`:

1. Parse `installedJar` type.
2. `forge`/`neoforge`: locate the platform argfile under the vendor path (glob the version dir). Found → spawn `java -Xms<min> -Xmx<max> [user jvmArgs] @<argfile relative path> nogui` with `cwd = serverDir`. Missing → legacy-Forge fallback: look for `forge-<mc>-<fv>*.jar` and jar-launch it; if neither exists, fail with *"Forge/NeoForge files missing — reinstall the server type from Settings."*
3. All other types: current jar launch, unchanged.

Dashboard RAM settings remain the source of truth; Forge's `user_jvm_args.txt` is intentionally bypassed.

### 1.4 Update checks (`checkJarUpdate`)

Same "stay on your MC version line" policy as Paper:

- `fabric` → newest stable loader vs installed loader version.
- `neoforge`/`forge` → newest maven/promotions entry for the same MC version.

`GET /jars/check` response shape unchanged (`build`/`latestBuild` carry the loader version string for modded types).

### 1.5 Install/download API (`server/routes/jars.js`)

- `GET /jars/versions` → adds `fabric: [mcVersions]`, `neoforge: { "<mc>": "<neoVersion>", … }`, `forge: { "<mc>": "<forgeVersion>", … }` alongside existing `paper`/`vanilla` arrays. UI shows MC versions; loader build is auto-latest (spec'd non-goal: pickers).
- `POST /jars/download { type, version }` → accepts the three new types; requires server offline (existing rule); synchronous like today with progress via `pushLog`. For argfile types this downloads + runs the installer; a pre-existing `mods/` folder is left untouched.

### 1.6 UI

- **Setup wizard** (`client/js/setup.js`): server-type choices become Paper / Vanilla / Fabric / NeoForge / Forge with one-line guidance each (e.g. Fabric: "Runs mods — best for performance mods"; NeoForge: "Modern modded + big modpacks"; Forge: "Classic modpacks"). Version picker reuses the existing flow.
- **Settings jar picker**: same five types + MC version dropdown per type.
- **Java hint:** non-blocking warning when the configured Java major version mismatches the chosen MC version (MC ≥1.20.5 → Java 21; 1.18–1.20.4 → 17; ≤1.16 Forge → 8). Shown in the picker UI and logged at start. We warn, never refuse.
- Switching between loader families leaves `mods/` alone but the Content page shows a hint that mods aren't cross-loader compatible.

New code in `server/utils/loaders.js`; `jars.js` dispatches to it.

## 2. Content Hub (client)

The "Plugins" nav entry becomes **"Content"**. One page, two zones. Files: `client/js/plugins.js` (page shell + Installed zone, stays the registered page) and new `client/js/discover.js` (Discover zone + details modal + modpack flow) — both under 500 lines. `index.html` gains the script tag; `sw.js` cache list + version bump.

### 2.1 Discover zone

- **Tabs:** Plugins / Mods / Modpacks → Modrinth `project_type` plugin/mod/modpack.
- **Controls:** search box; sort (Relevance / Downloads / Recently updated / Newest); category dropdown (from `/modrinth/categories`, per project type); MC-version dropdown (defaults to the server's installed MC version, "any" option); loader dropdown per tab — Plugins: paper/spigot/bukkit; Mods & Modpacks: fabric/neoforge/forge — defaulting to the server's own loader when it matches the tab.
- **Results:** 20 per page, **Load more** appends (offset-based). Row: icon, title, downloads, description, quick **Install** (newest version matching loader + MC filter) and **Details**. Quick Install on a modpack opens Details instead (modpack install needs its confirmation flow).
- **Defaults on open:** tab preselected from server type (modded → Mods, else Plugins) with top-downloads listing so the zone is never empty.

### 2.2 Details modal

- Data from `/modrinth/project/:slug` + `/modrinth/project/:slug/versions`.
- Shows: icon, title, author-less summary line (downloads, followers, categories), **full description**, gallery thumbnails (click → open image in new tab), and a **version picker** (version number, MC versions, loader, release/beta/alpha badge, date) + Install for the selected version (existing `/modrinth/install` with `versionId`).
- **Description rendering:** Modrinth bodies are markdown, often containing raw HTML. Render via DOMParser: parse, then rebuild against a tag whitelist (`p br a img h1–h6 ul ol li b strong i em code pre blockquote hr details summary table thead tbody tr td th center`), dropping all attributes except `href` (https only, `target=_blank rel=noopener`) and `src` (https `cdn.modrinth.com` / `*.githubusercontent.com` only), plus a minimal markdown pass (headings, bold/italic, code, links, images, lists) for md-only bodies. Everything else is escaped text. No new dependencies.

### 2.3 Installed zone

Today's list, kept: `plugins/`/`mods/` toggle, upload, delete, SHA1 update-check with per-file Update button. The intro hint adapts to the installed server type ("Your server is Fabric — plugins won't load" etc.).

## 3. Modrinth API extensions (`server/routes/modrinth.js`)

All endpoints keep the existing patterns: slug/id regex validation, trimmed response fields, `{error}` JSON, Modrinth-CDN-only binaries. All Modrinth calls gain a polite `User-Agent: chunkdeck/<version> (chunkdeck.dev)`.

| Endpoint | Params | Returns |
|---|---|---|
| `GET /search` (extended) | `q`, `type` (plugin\|mod\|modpack), `loader`, `gameVersion`, `sort` (relevance\|downloads\|updated\|newest), `category`, `offset` (≤1000), limit fixed 20 | `{ hits: [{slug,title,description,icon,downloads}], total }` |
| `GET /project/:slug` (new) | — | `{slug,title,description,body,icon,downloads,followers,categories,gallery:[{url,title}],projectType,gameVersions,loaders,sourceUrl}` (gallery filtered to Modrinth CDN) |
| `GET /project/:slug/versions` (new) | `loader`, `gameVersion` (both optional) | up to 50 of `{id,versionNumber,versionType,gameVersions,loaders,datePublished,size}` |
| `GET /categories` (new) | `type` | `[name…]` from Modrinth tag API, in-memory cache 1 h |
| `POST /install` (extended) | adds optional `gameVersion` — newest-version resolution filters by it | unchanged |
| `POST /modpack/install` (new) | `{versionId, backupWorld}` | `{started:true}` (409 if server online or a job already running) |
| `GET /modpack/status` (new) | — | `{running, step, detail, done, error, summary}` |

## 4. Modpack Install

### 4.1 Flow (background job in new `server/utils/mrpack.js`, one at a time)

1. **Preconditions:** server offline; no job running. Server **start is blocked** (409) while the job runs.
2. Resolve version by id → must belong to a `modpack` project; primary file must be `.mrpack` ≤ 1 GB from Modrinth CDN → download to `<serverDir>/.mrpack-tmp-<ts>/`, extract with `extract-zip` (already a dependency), read `modrinth.index.json` (`formatVersion: 1`, `game: "minecraft"`).
3. **Dependencies:** `minecraft` + one of `fabric-loader`/`neoforge`/`forge`. `quilt-loader` → clean error *"Quilt modpacks aren't supported yet."* Install that exact loader + MC version via §1 (pinned versions, not latest).
4. **Backups first:** world backup via existing `createBackup()` (default on, UI checkbox); non-empty `mods/` renamed to `mods-backup-<ts>/`. Cleanup never touches `backups/` or `mods-backup-*/`. Individual config files overwritten by overrides are *not* backed up (documented limitation).
5. **Files:** for each `files[]` entry: skip `env.server === "unsupported"`; path must be relative, traversal-free, and not touch the protected set (`server.jar`, `eula.txt`, `server.properties`, `whitelist.json`, `ops.json`, `banned-*.json`, `world*/`, dashboard/tmp dirs); download only from `cdn.modrinth.com` (others skipped + reported); verify **sha512**; 250 MB/file cap; 4 concurrent; per-file failures don't abort the job.
6. **Overrides:** extract `overrides/` then `server-overrides/` (wins) into serverDir with the same path guards + protected-set exclusions (skipped files reported).
7. **Finish:** config gets `installedJar` (from loader install) + `modpackName` (shown as "NeoForge 1.21.4 — via <pack>"); temp dir removed; summary `{installed, skipped:[{file,reason}], loader, mc}`; console log throughout; UI toast "Modpack installed — start the server".

### 4.2 UI flow (details modal → Install modpack)

Confirmation dialog states exactly: server files it will replace (server type/version, `mods/` swap, config overrides), the backup checkbox (world, default on), and that the server must stay stopped during install. Progress = status polling + the live console; on completion the summary renders in the modal (installed count + skipped list).

## 5. Schedule Presets (multi-task bundles)

### 5.1 Model & storage

Preset = `{ id, name, description?, builtIn, tasks: [scheduleFields…] }` where each task uses the existing schedule field shapes (no `id`/`lastRun`/`nextRun`). Built-ins ship in code (`server/utils/schedule-presets.js`); custom presets persist in `DATA_DIR/schedule-presets.json`. Limits: name ≤ 60 chars (unique, case-insensitive), ≤ 30 custom presets, ≤ 20 tasks per preset.

### 5.2 Built-in bundles

| Name | Tasks |
|---|---|
| **Daily maintenance** | backup daily 03:30 · restart daily 04:00, warn 5 min |
| **Frequent backups** | backup every 6 h |
| **Public server** | restart daily 05:00 warn 10 · backup every 4 h · announce daily 18:00 ("Enjoying the server? Edit this announcement in Schedules!") |
| **Low-maintenance** | restart weekly Sun 05:00 warn 10 · backup daily 04:00 only-when-empty |

### 5.3 API (`server/routes/schedules.js`)

- `GET /schedules/presets` → built-ins + custom.
- `POST /schedules/presets { name }` → snapshot of the **current** schedule list (400 if empty).
- `POST /schedules/presets/:id/apply { mode: "add" | "replace" }` → every task validated via `validationError()` first, all-or-nothing (400 names the failing task); `add` uses `scheduler.add` per task, `replace` uses existing `scheduler.replaceAll`.
- `DELETE /schedules/presets/:id` → custom only (400 for built-ins).

Route order note: `/presets` routes are registered before the existing `/:id` routes.

### 5.4 UI (`client/js/schedules.js`)

"Presets" card above the schedule form: each preset renders name + compact task list (reuses `describe()`), **Apply** (inline choice: *Add to current* / *Replace current*, replace asks confirm), delete icon on custom presets, and a **Save current as preset** button (name prompt; disabled when no schedules exist).

## 6. Security Summary

- Outbound hosts allow-listed everywhere: `api.modrinth.com`, `cdn.modrinth.com`, `meta.fabricmc.net`, `maven.neoforged.net`, `files.minecraftforge.net`, `maven.minecraftforge.net` (+ existing Paper/Mojang hosts).
- Size caps: installer 100 MB, mod file 250 MB, mrpack 1 GB. Hash verification (sha512) for all modpack files; existing sha1 flow for update checks unchanged.
- Path traversal guards on every extraction/write; protected-file set never overwritten by packs; `.jar`-name regex reused.
- Description HTML sanitized by whitelist rebuild (no raw `innerHTML` of remote content anywhere).
- Preset names/tasks validated server-side; presets file corruption → start with empty custom list, never crash.

## 7. Error Handling

- Consistent `{error}` + HTTP status; client `App.tryApi` toasts (existing pattern).
- Loader install failures surface installer output tail in the error and leave the previous `installedJar` config untouched until success.
- Modpack job: any fatal error → job ends with `error` set, partial state reported honestly (what was installed/renamed), backups intact. UI offers "restore mods backup" guidance text (manual via Files page — no auto-rollback in v1.1, documented).
- Argfile missing at launch → actionable error (§1.3), server stays offline.

## 8. File Plan

| File | Change |
|---|---|
| `server/utils/loaders.js` | **new** — fabric/neoforge/forge version lists, installers, argfile discovery, java-version hints |
| `server/utils/mrpack.js` | **new** — modpack job (download/parse/install/report) |
| `server/utils/schedule-presets.js` | **new** — built-ins + custom preset store |
| `server/utils/jars.js` | dispatch download/check to loaders.js for new types |
| `server/minecraft.js` | launch abstraction (argfile vs jar) |
| `server/routes/jars.js` | new types in versions/download |
| `server/routes/modrinth.js` | extended search/install; project, versions, categories, modpack endpoints; UA header |
| `server/routes/schedules.js` | presets endpoints |
| `client/js/plugins.js` | becomes Content page shell + Installed zone |
| `client/js/discover.js` | **new** — Discover zone, details modal, sanitizer, modpack flow |
| `client/js/schedules.js` | Presets card |
| `client/js/setup.js` | wizard server types |
| `client/js/settings.js` | jar picker types + java hint (picker code at ~line 687) |
| `client/index.html`, `client/sw.js`, `client/css/main.css` | nav label, script tag, cache bump, styles |
| `package.json` | version 1.1.0 |

## 9. Manual Test Checklist (no test framework in repo)

1. Fresh wizard install of each type: paper, vanilla, fabric, neoforge, forge (modern MC) → server starts, console works, stop works.
2. Forge legacy path: 1.12.2 install → jar-launch fallback works.
3. Content hub: each tab searches, sorts, filters (category + MC version), paginates; details modal renders HTML-heavy (Sodium) and md-only descriptions; gallery; version picker installs chosen version into the right folder.
4. Update flow still works for plugins and mods (SHA1 match → update button).
5. Modpack E2E on a NeoForge pack and a Fabric pack: backups made, mods installed + verified, overrides applied, protected files untouched, server starts and loads the pack; quilt pack rejected cleanly; job blocks server start while running.
6. Presets: apply add + replace for built-ins; save current as preset; delete custom; built-in delete rejected; invalid preset file on disk → app still boots.
7. Schedules regression: existing schedules still fire (spot-check interval + daily), edit/toggle/delete unaffected.
8. `npm start` on a clean checkout; sw.js serves the new assets after version bump.

## 10. Release

Version **1.1.0**. Highlights for release notes: "Run modded servers (Fabric, NeoForge, Forge) · Browse & install mods, plugins and full modpacks from Modrinth · One-click schedule preset bundles — or save your own."
