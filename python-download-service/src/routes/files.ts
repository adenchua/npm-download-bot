import { Router, Request, Response } from "express";
import { format, formatISO, isToday } from "date-fns";

import { readdirSync, statSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

import { PythonPayload } from "../types";
import { validatePayload } from "../resolver";

export const filesRouter = Router();

filesRouter.post("/upload", async (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const body = req.body as PythonPayload;

  const validationError = validatePayload(body);
  if (validationError) {
    const statusCode = validationError.startsWith("Request body") ? 400 : 422;
    res.status(statusCode).json({ error: validationError });
    return;
  }

  const datePrefix = format(new Date(), "yyyyMMdd");
  const todayCount = readdirSync(INPUT_DIR).filter(
    (file) => file.startsWith(datePrefix) && file.endsWith(".json"),
  ).length;
  const id = `${datePrefix}-${format(new Date(), "HHmm")}-${todayCount + 1}`;

  const sanitized: PythonPayload = {};
  if (body.requirements) sanitized.requirements = body.requirements;
  if (body.devRequirements) sanitized.devRequirements = body.devRequirements;
  if (body.platforms) sanitized.platforms = body.platforms;
  if (body.pythonVersions) sanitized.pythonVersions = body.pythonVersions;

  writeFileSync(join(INPUT_DIR, `${id}.json`), JSON.stringify(sanitized, null, 2));

  res.status(201).json({ id });
});

filesRouter.get("/files", async (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const showToday = req.query.showToday === "true";

  const entries = readdirSync(INPUT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const stat = statSync(join(INPUT_DIR, file));
      return {
        id: basename(file, ".json"),
        filename: file,
        sizeBytes: stat.size,
        uploadedAt: formatISO(stat.birthtime),
        birthtime: stat.birthtime,
      };
    })
    .filter((entry) => !showToday || isToday(entry.birthtime))
    .map(({ birthtime: _birthtime, ...rest }) => rest);

  res.json(entries);
});
