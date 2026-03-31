import { Router, Request, Response } from "express";

import { existsSync } from "fs";
import { join, resolve } from "path";

import { resolveAllDependencies } from "../resolver";
import { downloadAndZip } from "../downloader";

export const jobsRouter = Router();

// POST /jobs — fire-and-forget download job
jobsRouter.post("/", async (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const { id } = req.body as { id?: string };

  if (!id || typeof id !== "string") {
    res.status(400).json({ error: "Request body must contain { id: string }" });
    return;
  }

  const inputPath = join(INPUT_DIR, `${id}.json`);
  if (!existsSync(inputPath)) {
    res.status(404).json({ error: `No uploaded file found for id: ${id}` });
    return;
  }

  res.status(202).json({ message: "Job started", id });

  runJob(id, inputPath).catch((err) => {
    console.error(`[job:${id}] failed:`, err instanceof Error ? err.message : err);
  });
});

async function runJob(id: string, inputPath: string): Promise<void> {
  console.log(`[job:${id}] starting resolve…`);
  const { packages, audit } = await resolveAllDependencies(inputPath);
  console.log(`[job:${id}] resolved ${packages.length} packages, starting pack…`);
  await downloadAndZip(packages, id, audit);
  console.log(`[job:${id}] complete → output/${id}.tgz`);
}
