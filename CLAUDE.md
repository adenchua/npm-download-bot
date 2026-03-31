# CLAUDE.md — npm-download-bot

## Repository layout

| Directory | Role |
|-----------|------|
| `npm-download-service/` | HTTP service that resolves and bundles npm dependencies as offline `.zip` archives |
| `telegram-bot/` | Telegram bot for submitting download requests and managing user access |
| `database/` | MongoDB schema definitions and init scripts |

## Development commands

Both `npm-download-service` and `telegram-bot` share the same scripts (run from the relevant package directory):

| Command | Description |
|---------|-------------|
| `npm start` | Run with `tsx` — no build step; requires a populated `.env` |
| `npm run dev` | Same as `start` but restarts on file changes |
| `npm run build` | Compile TypeScript to `dist/` via `tsc` |
| `npm run format` | Reformat all `src/**/*.{ts,js}` with Prettier |

## Docker Compose

Four services with explicit health-check dependencies:

```
npm-download-service  (health: GET /health)
mongodb               (health: mongosh ping)   ← initialised by database/init/01-init.js on first run
  └── telegram-bot    (depends on mongodb + npm-download-service, both healthy)
  └── mongo-express   (depends on mongodb, healthy)
```

Volume mounts:
- `npm-download-service/input/` and `output/` → `/app/input` and `/app/output`
- `database/data/` → `/data/db` (MongoDB persistence)
- `database/init/` → `/docker-entrypoint-initdb.d/` (runs once on init)
- `database/schemas/` → `/schemas/` (read by init script)

`NPM_DOWNLOAD_SERVICE_URL` is injected directly via `environment:` in the compose file so the telegram-bot always resolves to `http://npm-download-service:3000` inside Docker, regardless of what is in `telegram-bot/.env`.

## npm-download-service source map

| File | Role |
|------|------|
| `npm-download-service/src/index.ts` | HTTP server entry point; creates `input/` and `output/` dirs, starts Express on `SERVER_PORT` |
| `npm-download-service/src/app.ts` | Express app factory; mounts `filesRouter` and `jobsRouter`, registers global `errorHandler` |
| `npm-download-service/src/routes/files.ts` | `POST /upload` and `GET /files` (with `?showToday` filter) |
| `npm-download-service/src/routes/jobs.ts` | `POST /jobs` — fire-and-forget download job |
| `npm-download-service/src/middleware/errorHandler.ts` | Global Express error handler |
| `npm-download-service/src/resolver.ts` | Creates a temp dir, merges `dependencies`/`devDependencies`/`peerDependencies`, runs `npm install` to materialise the full dependency tree, walks `node_modules`, then runs `npm audit`. Complex peer dep version ranges (`\|\|`, comparisons) are resolved to a concrete latest version via `semver.maxSatisfying()` before install. |
| `npm-download-service/src/downloader.ts` | Iterates resolved packages, runs `npm pack <name>@<version>` for each, zips all tarballs + `metadata.json` via `archiver` |
| `npm-download-service/src/types.ts` | All shared TypeScript interfaces (`PackageJson`, `ResolvedPackage`, `AuditReport`, `PackageMetadata`, etc.) |

## telegram-bot source map

| File | Role |
|------|------|
| `telegram-bot/src/index.ts` | Bot entry point; registers middleware (session → cancel → stage), all command handlers, `bot.on('message')` passive package.json handler, startup validation of env vars and DB indexes |
| `telegram-bot/src/db/index.ts` | MongoDB connection management (`connectDb`, `getDb`, `closeDb`) |
| `telegram-bot/src/db/clients.ts` | `clients` collection: `registerClient`, `approveClient`, `getClientByTelegramId`, `getPendingClients`, `verifyIndexes` |
| `telegram-bot/src/db/subscribers.ts` | `subscribers` collection: `addSubscriber`, `removeSubscriber`, `getAllSubscribers`, `verifyIndexes` |
| `telegram-bot/src/commands/helpers.ts` | Shared helpers: `BotContext`, `getText`, `requireText`, `checkSecret`, `parseAndValidatePackageJson`, `MAX_PACKAGE_JSON_BYTES`, `ALLOWED_MIME_TYPES` |
| `telegram-bot/src/commands/approveClient.ts` | 4-step wizard: prompt secret → validate → show inline keyboard of pending clients → confirm with Yes/No buttons → approve |
| `telegram-bot/src/commands/subscribe.ts` | Two 2-step wizards: `subscribeScene` and `unsubscribeScene` |
| `telegram-bot/src/commands/request.ts` | 2-step wizard: prompt for `package.json` → validate → `POST /upload` → `POST /jobs` → reply job ID → notify all subscribers. Exports `processPackageJsonRequest(ctx, pkg)` — shared by the wizard and the passive message handler in `index.ts` |

## database source map

| File | Role |
|------|------|
| `database/schemas/clients.json` | Collection + unique index definition for `clients` |
| `database/schemas/subscribers.json` | Collection + unique index definition for `subscribers` |
| `database/init/01-init.js` | mongosh init script; reads every `*.json` from `/schemas`, creates collections and indexes |

## Architectural decisions

**Prettier for code formatting** — both `npm-download-service` and `telegram-bot` use Prettier (exact version, pinned in `devDependencies`) with a shared config: `trailingComma: "all"`, `printWidth: 120`, `useTabs: false`, `tabWidth: 2`. Run `npm run format` in either package to reformat all `src/**/*.{ts,js}` files. Config lives in `.prettierrc` at each package root.

**Import ordering** — imports are grouped in three sections, each separated by a blank line: (1) internet/npm packages (e.g. `express`, `telegraf`, `date-fns`), (2) Node.js built-in/library packages (e.g. `fs`, `path`, `os`, `child_process`), (3) project-local imports (e.g. `./app`, `../types`). No `import * as X` wildcard imports for internet or library packages — always use named imports (e.g. `import { readFileSync, writeFileSync } from "fs"`). In `downloader.ts` the Promise executor uses `(resolveZip, rejectZip)` to avoid shadowing the `resolve` named import from `path`.

**tsx instead of ts-node** — no build step needed; `npm start` executes TypeScript directly via esbuild. `npm run build` (tsc → `dist/`) exists for producing a compiled binary but is not required for development.

**HTTP API instead of interactive CLI** — the service exposes a REST API. Upload a `package.json` via `POST /upload`, then trigger a job via `POST /jobs`. The old interactive prompt (`@inquirer/prompts`) has been replaced.

**File stem as archive ID** — uploaded files are saved as `input/<id>.json` where the ID is `yyyyMMdd-HHmm-X` (X = 1-indexed count of `.json` files in `input/` at upload time). This produces `output/<id>.zip`. No separate manifest file.

**`maxBuffer: 1024 * 1024 * 1024` on `npm pack`** — large packages (e.g. `@mui/icons-material`) emit multi-megabyte stderr (peer dependency warnings). The default 1 MB buffer causes silent failures. Set to 1 GB; only text is buffered, not binary tarballs.

**`--no-audit` on `npm install`, explicit `npm audit --json` after** — `--no-audit` only suppresses the inline install-time report; it does not affect `package-lock.json`. Running `npm audit --json` separately after install reads the lock file and always produces accurate results.

**`date-fns` for local-time timestamps** — all timestamps (`startedAt`, `completedAt`, `uploadedAt`, health check) use `formatISO()` from `date-fns`, which produces local time with UTC offset (e.g. `2026-03-21T10:00:00+08:00`) instead of UTC `Z` strings. The ID prefix uses `format(new Date(), 'yyyyMMdd-HHmm')` for a compact local-time stamp. `telegram-bot` also uses `date-fns` (`format()`) when displaying `registeredAt` timestamps to the admin in the approve-client flow.

**`TZ=Asia/Singapore` in containers** — `npm-download-service` and `telegram-bot` both set `TZ: Asia/Singapore` via `environment:` in `docker-compose.yml`. Without this, Node.js inside the container uses UTC, making all `date-fns` local-time calls produce UTC timestamps and UTC-offset IDs (`+00:00`).

**Schema-driven DB initialisation** — `database/schemas/*.json` are the single source of truth for collection structure. `database/init/01-init.js` reads all JSON files generically on first MongoDB startup; adding a new collection means adding one JSON file with no changes to the init script.

**`$setOnInsert` upsert for idempotent registration** — `registerClient` and `addSubscriber` use `updateOne({ telegramId }, { $setOnInsert: data }, { upsert: true })`. Re-registering returns `upsertedCount === 0` and is a complete no-op in the database; the original document is never overwritten.

**`verifyIndexes()` at startup** — both `clients.ts` and `subscribers.ts` expose a `verifyIndexes()` function that checks for the required unique index by name. Both are called in `main()` before `bot.launch()`. The bot refuses to start if the indexes are missing, which catches the case where the DB volume predates the init scripts.

**`APPROVE_SECRET` as an admin gate** — the secret is read from `process.env.APPROVE_SECRET` once at module load in `commands/helpers.ts`. All commands that require it start a wizard conversation: the bot prompts for the secret as the first step and validates it before proceeding.

**`/cancel` middleware ordering** — the cancel command is registered on the bot after `session()` but before `stage.middleware()`. This ensures it intercepts `/cancel` before any active scene's step handlers can consume the message. It reads `ctx.session.__scenes.current` (via the typed `Scenes.WizardSession` cast) to detect whether a scene is active.

**Shared wizard helpers** — all shared helpers live in `commands/helpers.ts`. `parseAndValidatePackageJson(text)` is the key one: it parses a JSON string, asserts the result is a non-array object with at least one dep field, validates that all dep values are strings (prevents resolver crashes), and returns only the allowlisted fields (`name`, `version`, `dependencies`, `devDependencies`, `peerDependencies`) — stripping everything else before it reaches `/upload`. Returns `null` on any failure.

**Passive package.json detection** — `index.ts` registers a `bot.on('message')` handler (after all commands) that automatically processes messages as a `/request` without the user typing a command. It triggers when a registered+approved user sends any document or text starting with `{`. Before downloading a document, the handler checks `file_size` (>100 KB → silent return) and `mime_type`/file extension against `ALLOWED_MIME_TYPES` (`application/json`, `text/plain`, `text/json`, `application/octet-stream`, `.json`, `.txt`); unrecognised types are silently ignored. After downloading, body length is rechecked as defence-in-depth. Both document and text paths use `parseAndValidatePackageJson` and silently ignore invalid input. The upload+job+notify logic lives in the exported `processPackageJsonRequest` in `commands/request.ts`, shared with the wizard. The wizard applies the same size and MIME checks but replies with error messages instead of silently ignoring.

**`/help` lists only user-facing commands** — admin commands (`/subscribe`, `/unsubscribe`, `/approve_client`) are intentionally omitted from the `/help` reply to keep the interface clean for regular users.

## Known gotchas

- **`npm audit` exits with code 1** when vulnerabilities are found. `stdout` is still valid JSON. Always catch the error and read `err.stdout`; do not treat a non-zero exit as a failure.

- **Scoped packages in `node_modules`** (`@scope/pkg`) are nested one level deeper. `npm-download-service/src/resolver.ts` detects entries starting with `@` and recurses one extra level. Do not flatten this logic.

- **Tarball filename for scoped packages**: `@scope/pkg@1.0.0` → `scope-pkg-1.0.0.tgz`. Strip the leading `@`, replace the first `/` with `-`. See `tarballName()` in `npm-download-service/src/downloader.ts`.

- **`devDependencies` and `peerDependencies` are included** — `resolver.ts` merges `dependencies`, `devDependencies`, and `peerDependencies` before resolving. This is intentional; the tool targets full project snapshots. Peer deps already present in `dependencies`/`devDependencies` are not duplicated (first-writer wins). Complex peer dep version ranges containing `||` or comparison operators are resolved to the latest satisfying concrete version via `npm view <pkg> versions --json` + `semver.maxSatisfying()` before the temp `package.json` is written; simple ranges (`^`, `~`, exact) are passed through as-is.

- **`verifyIndexes` requires DB init** — if the MongoDB data volume already exists from before the init scripts were added, the required indexes will be absent and the bot will refuse to start. Run `docker compose down -v && docker compose up` to re-initialise the database.

- **`/cancel` uses `delete wizardSession.__scenes.current`** — assigning `{}` to `__scenes` fails TypeScript because `WizardSessionData.cursor` is a required field. Deleting only the `current` key is the correct approach; it removes the scene marker without touching other session data.

## Output structure (npm-download-service)

Each `output/<id>.zip` contains:

```
metadata.json
express-4.18.2.tgz
lodash-4.17.21.tgz
...
```

`metadata.json` fields: `startedAt`, `completedAt`, `summary` (total/succeeded/failed), `audit` (severity counts + `highPackages`/`criticalPackages` as `{name, version}[]`), `packages` (succeeded), `failedPackages` (with error message).
