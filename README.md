# npm-download-bot

An HTTP service that resolves all transitive npm dependencies from a `package.json` and packages them into a self-contained `.zip` archive for offline installation. Useful for air-gapped environments, dependency snapshots, and supply chain audits.

## Features

- **Full dependency resolution** — installs into a temporary directory to resolve the complete transitive dependency tree
- **Offline-ready archives** — each resolved package is downloaded as a `.tgz` tarball via `npm pack` and bundled into a `.zip`
- **Vulnerability audit** — runs `npm audit` and embeds severity counts plus HIGH/CRITICAL package details into the output
- **REST API** — upload a `package.json`, list uploaded files, and trigger download jobs over HTTP
- **Scoped package support** — handles `@scope/pkg` packages correctly
- **Detailed metadata** — every archive includes a `metadata.json` with local-time timestamps, download summary, and audit results

## Prerequisites

- Node.js 18+
- npm 8+

## Installation

```bash
git clone https://github.com/your-org/npm-download-bot.git
cd npm-download-bot/npm-download-service
npm install
```

## Docker

No Node.js required on the host. Uses bind mounts so your local `input/` and `output/` folders are shared with the container.

```bash
cd npm-download-service
docker compose up          # starts the HTTP server
docker compose build       # rebuild after code changes
```

## Usage

### Start the server

```bash
npm start   # listens on SERVER_PORT (default 3000)
```

### API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check; returns `{ status, timestamp }` |
| `POST` | `/upload` | Upload a `package.json` body; returns `{ id }` |
| `GET` | `/files` | List uploaded files |
| `GET` | `/files?showToday=true` | List only files uploaded today (local time) |
| `POST` | `/jobs` | Start a download job; body `{ id }` |

### Typical workflow

**1. Upload a `package.json`:**

```bash
curl -X POST http://localhost:3000/upload \
  -H 'Content-Type: application/json' \
  -d @my-project.json
# → { "id": "20260321-1000-<uuid>" }
```

**2. Trigger a download job:**

```bash
curl -X POST http://localhost:3000/jobs \
  -H 'Content-Type: application/json' \
  -d '{ "id": "20260321-1000-<uuid>" }'
# → 202 Accepted; job runs in the background
```

**3. Collect output** — the `.zip` archive appears in `output/<id>.zip` when the job completes.

## Input format

A standard `package.json` with `dependencies` and/or `devDependencies`:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

Both dependency sections are merged and fully resolved before downloading.

## Output format

Each `.zip` contains:

```
my-project.zip
├── metadata.json
├── express-4.18.2.tgz
├── lodash-4.17.21.tgz
├── accepts-1.3.8.tgz
└── ... (all transitive dependencies)
```

### metadata.json

```json
{
  "startedAt": "2026-03-21T10:00:00+09:00",
  "completedAt": "2026-03-21T10:02:34+09:00",
  "summary": {
    "total": 120,
    "succeeded": 118,
    "failed": 2
  },
  "audit": {
    "severities": {
      "info": 0,
      "low": 3,
      "moderate": 8,
      "high": 2,
      "critical": 1,
      "total": 14
    },
    "highPackages": [
      { "name": "semver", "version": "6.3.0" },
      { "name": "tough-cookie", "version": "2.5.0" }
    ],
    "criticalPackages": [
      { "name": "lodash", "version": "4.17.15" }
    ]
  },
  "packages": [
    { "name": "express", "version": "4.18.2", "tarball": "express-4.18.2.tgz" }
  ],
  "failedPackages": [
    { "name": "some-private-pkg", "version": "1.0.0", "error": "E404 Not Found" }
  ]
}
```

## Project structure

```
npm-download-bot/
└── npm-download-service/
    ├── src/
    │   ├── index.ts              # HTTP server entry point
    │   ├── app.ts                # Express app factory
    │   ├── resolver.ts           # Dependency resolution + npm audit
    │   ├── downloader.ts         # npm pack + zip creation
    │   ├── types.ts              # Shared TypeScript interfaces
    │   ├── routes/
    │   │   ├── files.ts          # POST /upload, GET /files
    │   │   └── jobs.ts           # POST /jobs
    │   └── middleware/
    │       └── errorHandler.ts
    ├── input/                    # Uploaded package.json files
    ├── output/                   # Generated .zip archives
    ├── Dockerfile
    ├── docker-compose.yml
    └── package.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start HTTP server (no build step) |
| `npm run dev` | Start with file watching |
| `npm run build` | Compile TypeScript to `dist/` |

## How it works

1. **Upload** — `POST /upload` saves the `package.json` body to `input/<id>.json` and returns the ID
2. **Trigger** — `POST /jobs` starts a background job for that ID
3. **Resolve** — writes a merged `package.json` to a temp directory and runs `npm install --ignore-scripts` to materialise the full dependency tree
4. **Audit** — runs `npm audit --json` against the installed lock file and extracts vulnerability counts and HIGH/CRITICAL package names
5. **Download** — runs `npm pack <name>@<version>` for every resolved package and collects the `.tgz` files
6. **Package** — zips all tarballs together with `metadata.json` into `output/<id>.zip`
7. **Cleanup** — removes the temp directory

## License

MIT
