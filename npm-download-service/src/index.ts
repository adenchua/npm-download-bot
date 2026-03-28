import { mkdirSync } from "fs";
import { join } from "path";

import { createApp } from "./app";

// Set cwd to the service root so path.resolve('input') and path.resolve('output')
// in routes and downloader.ts always resolve correctly regardless of where the
// process was started from.
const SERVICE_ROOT = join(__dirname, "..");
process.chdir(SERVICE_ROOT);

mkdirSync("input", { recursive: true });
mkdirSync("output", { recursive: true });

const PORT = parseInt(process.env.SERVER_PORT ?? "3000", 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(`npm-download-service listening on port ${PORT}`);
});
