# telegram-bot

Telegram bot interface for submitting npm package download requests and managing user access.

## Commands

| Command | Description | Auth |
|---------|-------------|------|
| `/start` | Welcome message | — |
| `/help` | List all commands | — |
| `/register` | Register your account (sets `isApproved: false`; an admin must approve before you can submit requests) | — |
| `/request` | Submit a `package.json` (file or pasted text) to queue an npm package download job; replies with the job ID and notifies all subscribers | Registered + approved |
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
