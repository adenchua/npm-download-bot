# telegram-bot

Telegram bot interface for submitting npm package download requests and managing user access.

## Submitting a request

Registered and approved users can submit a request in three ways:

- **Directly** — send any file, paste JSON text containing `dependencies`, `devDependencies`, or `peerDependencies`, or paste an npmjs.com package URL (e.g. `https://www.npmjs.com/package/react` or `https://www.npmjs.com/package/react/v/18.2.0`) at any time. The bot silently ignores non-matching input and starts a job, without requiring a command. Files must be under 100 KB and have a JSON-compatible MIME type or extension (`.json`, `.txt`, `application/json`, `text/plain`, `application/octet-stream`). When a URL is used without a version segment, the latest version is requested.
- **Via `/request`** — the bot prompts you to send the file, text, or npm URL, then processes it the same way.

Both paths reply with the job ID and notify all subscribers. The notification identifies the requester by `@username` if available, falling back to their first name, then their Telegram ID.

## Commands

| Command | Description | Auth |
|---------|-------------|------|
| `/start` | Welcome message | — |
| `/help` | List commands | — |
| `/register` | Register your account (sets `isApproved: false`; an admin must approve before you can submit requests) | — |
| `/request` | Prompted flow: submit a `package.json` (file or pasted text) or an npmjs.com URL to queue a download job | Registered + approved |
| `/subscribe` | Subscribe to job notifications | `APPROVE_SECRET` |
| `/unsubscribe` | Unsubscribe from job notifications | `APPROVE_SECRET` |
| `/approve_client` | Approve a registered client by Telegram ID or username | `APPROVE_SECRET` |
| `/cancel` | Cancel the current active conversation | — |

Commands marked **`APPROVE_SECRET`** start a 2-step conversation: the bot first asks for the admin secret, then performs the action only if it matches.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `MONGODB_URI` | Yes | MongoDB connection string (e.g. `mongodb://user:pass@mongodb:27017`) |
| `MONGODB_DB_NAME` | No | Database name (default: `npm-download-bot`) |
| `APPROVE_SECRET` | Yes | Admin secret used to gate privileged commands; use a strong random value |
| `NPM_DOWNLOAD_SERVICE_URL` | Yes | Base URL of the npm-download-service (set automatically by Docker Compose in production) |

## Local development

```bash
npm install
npm start       # requires a populated .env file
npm run dev     # starts with file watching
```

Copy `.env.template` to `.env` and fill in all required values. When running locally (outside Docker), set `NPM_DOWNLOAD_SERVICE_URL=http://localhost:3000` and `MONGODB_URI` to point at your local MongoDB instance.
