import { Router, Request, Response } from "express";

import { existsSync } from "fs";
import { join, resolve } from "path";

import { resolveAllDependencies } from "../resolver";
import { downloadAndZip } from "../downloader";
import { logger } from "../logger";

export const jobsRouter = Router();

// POST /jobs — fire-and-forget download job
jobsRouter.post("/", (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const { id } = req.body as { id?: string };

  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Request body must contain { id: string }" });
    return;
  }

  if (!/^\d{8}-\d{4}-\d+$/.test(id)) {
    res.status(400).json({ error: "Invalid id format" });
    return;
  }

  const inputPath = join(INPUT_DIR, `${id}.json`);
  if (!existsSync(inputPath)) {
    res.status(404).json({ error: `No uploaded file found for id: ${id}` });
    return;
  }

  res.status(202).json({ message: "Job started", id });

  runJob(id, inputPath).catch((err) => {
    logger.error(`[job:${id}] failed:`, err instanceof Error ? err.message : err);
  });
});

async function runJob(id: string, inputPath: string): Promise<void> {
  logger.log(`[job:${id}] starting resolve…`);
  const { packages, audit } = await resolveAllDependencies(inputPath);
  logger.log(`[job:${id}] resolved ${packages.length} packages, starting pack…`);
  await downloadAndZip(packages, id, audit);
  logger.log(`[job:${id}] complete → output/${id}.tgz`);
}
