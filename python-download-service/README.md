# python-download-service

An HTTP service that downloads Python packages as pre-built wheels for specified platforms and Python versions, and packages them as a self-contained `.tgz` archive for offline installation. Useful for air-gapped environments that need to `pip install` without internet access.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check; returns `{ status, timestamp }` |
| `POST` | `/upload` | Upload a Python requirements payload; returns `{ id }` |
| `GET` | `/files` | List all uploaded files with metadata |
| `GET` | `/files?showToday=true` | List only files uploaded today (local time) |
| `POST` | `/jobs` | Start a download job; body `{ id }`; returns 202 immediately |
| `GET` | `/docs` | Interactive API documentation (Swagger UI) |

## Typical workflow

**1. Upload a requirements payload:**

```bash
curl -X POST http://localhost:3002/upload \
  -H 'Content-Type: application/json' \
  -d '{
    "requirements": { "numpy": ">=1.24,<2.0", "requests": "*" },
    "platforms": ["linux_x86_64", "win_amd64"],
    "pythonVersions": ["3.11", "3.12"]
  }'
# → { "id": "20260523-1430-1" }
```

**2. Trigger a download job:**

```bash
curl -X POST http://localhost:3002/jobs \
  -H 'Content-Type: application/json' \
  -d '{ "id": "20260523-1430-1" }'
# → 202 Accepted; job runs in the background
```

**3. Collect output** — the `.tgz` archive appears in `output/<id>.tgz` when the job completes.

## Input format

A JSON body with at least one of `requirements` or `devRequirements`, and optional `platforms` and `pythonVersions` arrays:

```json
{
  "requirements": {
    "numpy": ">=1.24,<2.0",
    "requests": "*",
    "pillow": ">=10.0.0"
  },
  "devRequirements": {
    "pytest": ">=7.0",
    "mypy": "*"
  },
  "platforms": ["linux_x86_64", "win_amd64"],
  "pythonVersions": ["3.11", "3.12"]
}
```

Both `requirements` and `devRequirements` are merged into a single requirements file before downloading — the split exists only to reflect project structure. Version specs follow standard pip syntax (e.g. `>=1.24,<2.0`, `==1.0.0`, `~=2.1`, `*`).

When `platforms` is omitted, the service defaults to `["linux_x86_64", "win_amd64"]`. When `pythonVersions` is omitted, it defaults to `["3.11", "3.12"]`. The service runs one `pip download` pass per `(platform, pythonVersion)` combination.

### Supported platforms

`linux_x86_64`, `linux_aarch64`, `win_amd64`, `win32`, `macosx_14_0_arm64`, `macosx_12_0_x86_64`

### Supported Python versions

`3.10`, `3.11`, `3.12`, `3.13`

### Validation

| Condition | Status | Error |
|-----------|--------|-------|
| Body is not a JSON object | `400` | `"Request body must be a JSON object"` |
| Neither `requirements` nor `devRequirements` present | `422` | `"Payload must contain at least one of: requirements, devRequirements"` |
| A dep field is not an object | `422` | `"\"<field>\" must be an object"` |
| Total package count exceeds 500 | `422` | `"Too many packages: N (max 500)"` |
| A package name is not valid (PEP 508) | `422` | `"Invalid package name in \"<field>\": \"<name>\""` |
| A dep field contains a non-string value | `422` | `"All values in \"<field>\" must be strings"` |
| `platforms` contains an unsupported value | `422` | `"Invalid platform: \"<value>\". Allowed: …"` |
| `pythonVersions` contains an unsupported value | `422` | `"Invalid Python version: \"<value>\". Allowed: …"` |

The request body is capped at 100 KB by the HTTP server.

`POST /jobs` additionally validates that `id` matches the format `YYYYMMDD-HHmm-N` before constructing the input file path.

## Output format

Each `output/<id>.tgz` contains one `.whl` file per successfully downloaded wheel (deduplicated by filename across all targets), plus `metadata.json`:

```
<id>.tgz
├── metadata.json
├── numpy-2.2.0-cp311-cp311-linux_x86_64.whl
├── numpy-2.2.0-cp311-cp311-win_amd64.whl
├── numpy-2.2.0-cp312-cp312-linux_x86_64.whl
├── numpy-2.2.0-cp312-cp312-win_amd64.whl
└── requests-2.31.0-py3-none-any.whl   ← pure-Python wheel, one copy for all targets
```

Install on the target machine with:

```bash
pip install --no-index --find-links . numpy requests
```

pip automatically selects the correct wheel for the running Python version and OS.

### Wheel deduplication

Pure-Python wheels (tagged `py3-none-any` or similar) are identical across all targets and appear only once in the archive. Binary wheels have distinct filenames encoding platform and ABI (e.g. `cp311-cp311-linux_x86_64`) and are always unique.

### Failures are per-target, not per-job

If `pip download` fails for a specific `(platform, pythonVersion)` combination (e.g. no wheel exists for that target), that target is recorded in `failedTargets` and the job continues. The archive will contain whatever was successfully downloaded from the remaining targets.

### metadata.json

```json
{
  "startedAt": "2026-05-23T14:30:00+08:00",
  "completedAt": "2026-05-23T14:31:45+08:00",
  "summary": { "totalTargets": 4, "succeededTargets": 3, "failedTargets": 1 },
  "files": [
    "numpy-2.2.0-cp311-cp311-linux_x86_64.whl",
    "numpy-2.2.0-cp311-cp311-win_amd64.whl",
    "numpy-2.2.0-cp312-cp312-linux_x86_64.whl",
    "requests-2.31.0-py3-none-any.whl"
  ],
  "failedTargets": [
    { "platform": "win_amd64", "pythonVersion": "3.12", "error": "ERROR: Could not find a version that satisfies the requirement …" }
  ],
  "audit": { "critical": 0, "high": 0, "medium": 1, "low": 3, "unknown": 0 }
}
```

Vulnerability counts come from [pip-audit](https://github.com/pypa/pip-audit), run against the requirements file after all downloads complete. pip-audit exits non-zero when vulnerabilities are found; the service catches the error and reads `stdout` for the JSON report (same pattern as `npm audit`). If pip-audit itself fails, the audit field is zeroed and the job completes normally.

## Local development

```bash
npm install
npm start       # starts on SERVER_PORT (default 3002)
```

Requires a `.env` file — copy `.env.template` and set `SERVER_PORT` if needed.

**Important:** `pip3` and `pip-audit` must be installed and on `PATH`. When running via Docker Compose, both are installed in the service image automatically. When running locally, install them with:

```bash
pip install pip-audit
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start HTTP server (no build step required) |
| `npm run dev` | Start with file watching |
| `npm run build` | Compile TypeScript to `dist/` |

## How it works

1. **Upload** — `POST /upload` validates the payload (package names against PEP 508, allowed platforms and Python versions, total count ≤ 500), saves to `input/<id>.json`, and returns the ID
2. **Trigger** — `POST /jobs` starts a background job for that ID; responds 202 immediately
3. **Resolve targets** — expands `platforms × pythonVersions` into a list of `(platform, pythonVersion)` download targets; fills in defaults when either field is absent
4. **Download** — for each target, runs:
   ```
   pip3 download -r requirements.txt \
     --only-binary :all: \
     --platform <platform> \
     --python-version <version> \
     --implementation cp \
     --abi cp<VV> \
     --dest <per-target-dir>
   ```
   All targets run concurrently via `Promise.allSettled`. `--only-binary :all:` is required for pip to respect the `--platform` flag when cross-downloading for a different OS than the host. `execFile` (not `exec`) is used so that platform and version arguments are passed as literals — no shell metacharacter expansion.
5. **Merge** — wheels from all successful targets are merged into a shared directory; duplicate filenames (pure-Python wheels) are skipped (first-writer wins)
6. **Audit** — `pip-audit -r requirements.txt --format json` scans for known CVEs; severity counts are extracted and written to `metadata.json.audit`
7. **Package** — all wheels and `metadata.json` are bundled into `output/<id>.tgz` via `archiver`
8. **Cleanup** — the temp directory containing all per-target download dirs is removed
