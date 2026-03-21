# CLAUDE.md — npm-download-bot

## Project overview

CLI tool that resolves all transitive npm dependencies from a `package.json` and bundles every package as a `.tgz` tarball into an offline-ready `.zip` archive. Includes an embedded vulnerability audit report.

```bash
npm install
npm start   # launches interactive prompt → choose all or a specific file
```

### Docker

```bash
docker compose run --rm npm-download-bot   # interactive; bind mounts input/ and output/
docker compose build                        # rebuild after code changes
```

`stdin_open: true` + `tty: true` in `docker-compose.yml` provides the TTY required by `@inquirer/prompts`. The container requires outbound internet access to reach the npm registry.

## Source map

| File | Role |
|------|------|
| `src/index.ts` | CLI entry point; interactive `select` prompts via `@inquirer/prompts` |
| `src/resolver.ts` | Creates a temp dir, runs `npm install` to materialise the full dependency tree, walks `node_modules` to collect all resolved packages, then runs `npm audit` |
| `src/downloader.ts` | Iterates resolved packages, runs `npm pack <name>@<version>` for each, zips all tarballs + `metadata.json` via `archiver` |
| `src/types.ts` | All shared TypeScript interfaces (`PackageJson`, `ResolvedPackage`, `AuditReport`, `PackageMetadata`, etc.) |

## Architectural decisions

**tsx instead of ts-node** — no build step needed; `npm start` executes TypeScript directly via esbuild. `npm run build` (tsc → `dist/`) exists for producing the `npm-dl` binary but is not required for development.

**`@inquirer/prompts` instead of `commander`** — the CLI is fully interactive. No subcommands or flags. Two `select` prompts: first to choose "all" vs "specific file", second (conditional) to pick a file from `input/`. `commander` has been removed.

**File stem as archive ID** — `input/my-project.json` produces `output/my-project.zip`. No UUID, no separate manifest. The input filename is the identity.

**`maxBuffer: 1024 * 1024 * 1024` on `npm pack`** — large packages (e.g. `@mui/icons-material`) emit multi-megabyte stderr (peer dependency warnings). The default 1 MB buffer causes silent failures. Set to 1 GB; only text is buffered, not binary tarballs.

**`--no-audit` on `npm install`, explicit `npm audit --json` after** — `--no-audit` only suppresses the inline install-time report; it does not affect `package-lock.json`. Running `npm audit --json` separately after install reads the lock file and always produces accurate results.

**`metadata.json`** — embedded in every archive alongside the tarballs.

## Known gotchas

- **`npm audit` exits with code 1** when vulnerabilities are found. `stdout` is still valid JSON. Always catch the error and read `err.stdout`; do not treat a non-zero exit as a failure.

- **Scoped packages in `node_modules`** (`@scope/pkg`) are nested one level deeper. `resolver.ts` detects entries starting with `@` and recurses one extra level. Do not flatten this logic.

- **Tarball filename for scoped packages**: `@scope/pkg@1.0.0` → `scope-pkg-1.0.0.tgz`. Strip the leading `@`, replace the first `/` with `-`. See `tarballName()` in `src/downloader.ts`.

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
