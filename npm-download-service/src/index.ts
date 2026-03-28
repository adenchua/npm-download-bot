import * as fs from "fs";
import * as path from "path";

// Set cwd to the service root so path.resolve('input') and path.resolve('output')
// in routes and downloader.ts always resolve correctly regardless of where the
// process was started from.
const SERVICE_ROOT = path.join(__dirname, "..");
process.chdir(SERVICE_ROOT);

fs.mkdirSync("input", { recursive: true });
fs.mkdirSync("output", { recursive: true });

import { createApp } from "./app";

const PORT = parseInt(process.env.SERVER_PORT ?? "3000", 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(`npm-download-service listening on port ${PORT}`);
});
