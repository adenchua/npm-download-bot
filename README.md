# npm-download-bot

A CLI tool that resolves all transitive npm dependencies from a `package.json` and packages them into a self-contained `.zip` archive for offline installation. Useful for air-gapped environments, dependency snapshots, and supply chain audits.

## Features

- **Full dependency resolution** — installs into a temporary directory to resolve the complete transitive dependency tree
- **Offline-ready archives** — each resolved package is downloaded as a `.tgz` tarball via `npm pack` and bundled into a `.zip`
- **Vulnerability audit** — runs `npm audit` and embeds severity counts plus HIGH/CRITICAL package details into the output
- **Batch processing** — drop multiple `package.json` files into `input/` and process them all in one run
- **Scoped package support** — handles `@scope/pkg` packages correctly
- **Detailed metadata** — every archive includes a `METADATA.json` with timestamps, download summary, and audit results

## Prerequisites

- Node.js 18+
- npm 8+

## Installation

```bash
git clone https://github.com/your-org/npm-download-bot.git
cd npm-download-bot
npm install
```

## Docker

No Node.js required on the host. Uses bind mounts so your local `input/` and `output/` folders are shared with the container.

### Run (first time builds the image automatically)

```bash
docker compose run --rm npm-download-bot
```

### Subsequent runs

```bash
docker compose run --rm npm-download-bot
```

Drop your `package.json` files into the local `input/` folder before running. Output `.zip` archives will appear in your local `output/` folder.

> `docker compose run` allocates a TTY automatically — required for the interactive prompt.
> To rebuild after code changes: `docker compose build`

## Usage

### 1. Add input files

Place one or more `package.json` files into the `input/` directory. The filename (without extension) becomes the archive ID.

```
input/
  my-project.json
  another-app.json
```

### 2. Run

```bash
npm start
```

An interactive prompt will appear:

```
? What would you like to do?
❯ Download all files (2 found)
  Download a specific file
```

Selecting **Download a specific file** shows a second prompt to choose which file:

```
? Select a file to download:
❯ my-project.json
  another-app.json
```

### 3. Collect output

Each input file produces a `.zip` archive in `output/`:

```
output/
  my-project.zip
  another-app.zip
```

### Built binary (after `npm run build`)

```bash
npm-dl
```

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
├── METADATA.json
├── express-4.18.2.tgz
├── lodash-4.17.21.tgz
├── accepts-1.3.8.tgz
└── ... (all transitive dependencies)
```

### METADATA.json

```json
{
  "startedAt": "2026-03-21T10:00:00.000Z",
  "completedAt": "2026-03-21T10:02:34.123Z",
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
├── src/
│   ├── index.ts        # CLI entry point (interactive prompts)
│   ├── resolver.ts     # Dependency resolution + npm audit
│   ├── downloader.ts   # npm pack + zip creation
│   └── types.ts        # Shared TypeScript interfaces
├── input/              # Drop package.json files here
├── output/             # Generated .zip archives
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch interactive prompt (no build step) |
| `npm run build` | Compile TypeScript to `dist/` |

## How it works

1. **Resolve** — writes a merged `package.json` to a temp directory and runs `npm install --ignore-scripts` to materialise the full dependency tree
2. **Audit** — runs `npm audit --json` against the installed lock file and extracts vulnerability counts and HIGH/CRITICAL package names
3. **Download** — runs `npm pack <name>@<version>` for every resolved package and collects the `.tgz` files
4. **Package** — zips all tarballs together with `METADATA.json` into `output/<id>.zip`
5. **Cleanup** — removes the temp directory

## License

MIT
