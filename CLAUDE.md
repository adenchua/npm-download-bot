# CLAUDE.md — npm-download-bot

## Repository layout

| Directory | Role |
|-----------|------|
| `npm-download-service/` | HTTP service that resolves and bundles npm dependencies as offline `.zip` archives |

## Project overview — npm-download-service

HTTP service that resolves all transitive npm dependencies from a `package.json` and bundles every package as a `.tgz` tarball into an offline-ready `.zip` archive. Includes an embedded vulnerability audit report.

```bash
cd npm-download-service
npm install
npm start   # starts HTTP server on SERVER_PORT (default 3000)
```

### Docker

```bash
cd npm-download-service
docker compose up        # starts the HTTP server; bind mounts input/ and output/
docker compose build     # rebuild after code changes
```

The container requires outbound internet access to reach the npm registry.

## Source map

| File | Role |
|------|------|
| `npm-download-service/src/index.ts` | HTTP server entry point; creates `input/` and `output/` dirs, starts Express on `SERVER_PORT` |
| `npm-download-service/src/app.ts` | Express app factory; mounts `filesRouter` and `jobsRouter`, registers global `errorHandler` |
| `npm-download-service/src/routes/files.ts` | `POST /upload` and `GET /files` (with `?showToday` filter) |
| `npm-download-service/src/routes/jobs.ts` | `POST /jobs` — fire-and-forget download job |
| `npm-download-service/src/middleware/errorHandler.ts` | Global Express error handler |
| `npm-download-service/src/resolver.ts` | Creates a temp dir, runs `npm install` to materialise the full dependency tree, walks `node_modules` to collect all resolved packages, then runs `npm audit` |
| `npm-download-service/src/downloader.ts` | Iterates resolved packages, runs `npm pack <name>@<version>` for each, zips all tarballs + `metadata.json` via `archiver` |
| `npm-download-service/src/types.ts` | All shared TypeScript interfaces (`PackageJson`, `ResolvedPackage`, `AuditReport`, `PackageMetadata`, etc.) |

## Architectural decisions

**tsx instead of ts-node** — no build step needed; `npm start` executes TypeScript directly via esbuild. `npm run build` (tsc → `dist/`) exists for producing a compiled binary but is not required for development.

**HTTP API instead of interactive CLI** — the service exposes a REST API. Upload a `package.json` via `POST /upload`, then trigger a job via `POST /jobs`. The old interactive prompt (`@inquirer/prompts`) has been replaced.

**File stem as archive ID** — uploaded files are saved as `input/<id>.json` where the ID is `yyyyMMdd-HHmm-<uuid>`. This produces `output/<id>.zip`. No separate manifest file.

**`maxBuffer: 1024 * 1024 * 1024` on `npm pack`** — large packages (e.g. `@mui/icons-material`) emit multi-megabyte stderr (peer dependency warnings). The default 1 MB buffer causes silent failures. Set to 1 GB; only text is buffered, not binary tarballs.

**`--no-audit` on `npm install`, explicit `npm audit --json` after** — `--no-audit` only suppresses the inline install-time report; it does not affect `package-lock.json`. Running `npm audit --json` separately after install reads the lock file and always produces accurate results.

**`date-fns` for local-time timestamps** — all timestamps (`startedAt`, `completedAt`, `uploadedAt`, health check) use `formatISO()` from `date-fns`, which produces local time with UTC offset (e.g. `2026-03-21T10:00:00+09:00`) instead of UTC `Z` strings. The ID prefix uses `format(new Date(), 'yyyyMMdd-HHmm')` for a compact local-time stamp.

**`metadata.json`** — embedded in every archive alongside the tarballs.

## Known gotchas

- **`npm audit` exits with code 1** when vulnerabilities are found. `stdout` is still valid JSON. Always catch the error and read `err.stdout`; do not treat a non-zero exit as a failure.

- **Scoped packages in `node_modules`** (`@scope/pkg`) are nested one level deeper. `npm-download-service/src/resolver.ts` detects entries starting with `@` and recurses one extra level. Do not flatten this logic.

- **Tarball filename for scoped packages**: `@scope/pkg@1.0.0` → `scope-pkg-1.0.0.tgz`. Strip the leading `@`, replace the first `/` with `-`. See `tarballName()` in `npm-download-service/src/downloader.ts`.

- **`devDependencies` are included** — `resolver.ts` merges `dependencies` and `devDependencies` before resolving. This is intentional; the tool targets full project snapshots.

## Output structure

Each `output/<id>.zip` contains:

```
metadata.json
express-4.18.2.tgz
lodash-4.17.21.tgz
...
```

`metadata.json` fields: `startedAt`, `completedAt`, `summary` (total/succeeded/failed), `audit` (severity counts + `highPackages`/`criticalPackages` as `{name, version}[]`), `packages` (succeeded), `failedPackages` (with error message).
