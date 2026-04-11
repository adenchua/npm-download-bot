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
| `/subscribe` | Subscribe to job notifications | Admin |
| `/unsubscribe` | Unsubscribe from job notifications | Admin |
| `/approve_client` | Approve a registered client by Telegram ID or username | Admin |
| `/notify_client` | Mark one of the last 5 pending jobs from the past 7 days as success or failed and notify the original requestor | Admin |
| `/cancel` | Cancel the current active conversation | — |

Commands marked **Admin** are gated by the `APPROVE_SECRET`. On first use, the bot prompts for the secret; on a match, it grants permanent admin status (`isAdmin: true`), auto-subscribes the admin to job notifications, and proceeds. On all subsequent uses, the secret prompt is skipped — the bot goes straight to the admin action. If the user is not yet registered, they are automatically registered and approved when the secret is first matched.

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
