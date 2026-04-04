# database

MongoDB configuration and schema definitions for the npm-download-bot system.

## Collections

| Collection | Fields | Unique index |
|------------|--------|--------------|
| `clients` | `telegramId`, `username` (optional), `registeredAt`, `isApproved` | `telegramId` (name: `client`) |
| `subscribers` | `telegramId`, `username` (optional), `subscribedAt` | `telegramId` (name: `subscriber`) |
| `jobs` | `clientId` (ref: `clients._id`), `jobId`, `startedAt`, `status` (optional: `"success"` \| `"failed"`), `completedAt` (optional), `completedBy` (optional: Telegram ID of the resolving admin) | `jobId` (name: `job`); index on `clientId` (name: `jobsByClient`); descending index on `startedAt` (name: `jobsByDate`) |

## Schema-driven initialisation

Collection schemas and their indexes are defined as JSON files in `database/schemas/`. The init script `database/init/01-init.js` reads every `*.json` file in that directory and creates the corresponding collections and indexes.

This script runs automatically via Docker's `/docker-entrypoint-initdb.d/` mechanism — **only once**, when the data directory is empty (i.e. on first startup or after `docker compose down -v`).

### Adding a new collection

1. Create a new JSON file in `database/schemas/`:

```json
{
  "collection": "my_collection",
  "indexes": [
    {
      "key": { "someField": 1 },
      "options": { "unique": true, "name": "my_index_name" }
    }
  ]
}
```

2. Re-run initialisation:

```bash
docker compose down -v
docker compose up
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB root user username |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root user password |
| `ME_CONFIG_MONGODB_ADMINUSERNAME` | MongoDB admin username for mongo-express (same value as root username) |
| `ME_CONFIG_MONGODB_ADMINPASSWORD` | MongoDB admin password for mongo-express (same value as root password) |
| `ME_CONFIG_MONGODB_SERVER` | MongoDB service hostname (`mongodb` — fixed value, already set in template) |
| `ME_CONFIG_BASICAUTH_USERNAME` | Basic auth username for the mongo-express UI |
| `ME_CONFIG_BASICAUTH_PASSWORD` | Basic auth password for the mongo-express UI |

Copy `.env.template` to `.env` and fill in all values before starting the stack.

## Inspecting the database

When the stack is running, mongo-express is available at `http://localhost:8081`. Use the credentials set in `MONGO_EXPRESS_USERNAME` and `MONGO_EXPRESS_PASSWORD`.
