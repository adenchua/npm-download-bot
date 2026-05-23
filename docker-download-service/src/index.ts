import { mkdirSync } from "fs";
import { join } from "path";

import { createApp } from "./app";
import { logger } from "./logger";

const SERVICE_ROOT = join(__dirname, "..");
process.chdir(SERVICE_ROOT);

mkdirSync("input", { recursive: true });
mkdirSync("output", { recursive: true });

const PORT = parseInt(process.env.SERVER_PORT ?? "3000", 10);
const app = createApp();

app.listen(PORT, () => {
  logger.log(`docker-download-service listening on port ${PORT}`);
});
