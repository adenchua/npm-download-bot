import { Router, Request, Response } from "express";
import { format, formatISO, isToday } from "date-fns";

import { readdirSync, statSync, writeFileSync } from "fs";
import { basename, join, resolve } from "path";

import { PackageJson } from "../types";

export const filesRouter = Router();

// POST /upload — body is a package.json object
filesRouter.post("/upload", async (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const body = req.body as PackageJson;

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  if (!body.dependencies && !body.devDependencies && !body.peerDependencies) {
    res.status(422).json({
      error: "package.json must contain at least one of: dependencies, devDependencies, peerDependencies",
    });
    return;
  }

  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const val = body[field];
    if (val === undefined) continue;
    if (typeof val !== "object" || val === null || Array.isArray(val)) {
      res.status(422).json({ error: `"${field}" must be an object` });
      return;
    }
    if (Object.values(val).some((v) => typeof v !== "string")) {
      res.status(422).json({ error: `All values in "${field}" must be strings` });
      return;
    }
  }

  const datePrefix = format(new Date(), "yyyyMMdd");
  const todayCount = readdirSync(INPUT_DIR).filter((f) => f.startsWith(datePrefix) && f.endsWith(".json")).length;
  const id = `${datePrefix}-${format(new Date(), "HHmm")}-${todayCount + 1}`;
  const b = body as Record<string, unknown>;
  const sanitized = Object.fromEntries(
    ["name", "version", "dependencies", "devDependencies", "peerDependencies"]
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, b[k]]),
  );
  writeFileSync(join(INPUT_DIR, `${id}.json`), JSON.stringify(sanitized, null, 2));

  res.status(201).json({ id });
});

// GET /files — list all uploaded package.json files
// Query params: showToday=true — only return files created today
filesRouter.get("/files", async (req: Request, res: Response) => {
  const INPUT_DIR = resolve("input");
  const showToday = req.query.showToday === "true";

  const entries = readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const stat = statSync(join(INPUT_DIR, f));
      return {
        id: basename(f, ".json"),
        filename: f,
        sizeBytes: stat.size,
        uploadedAt: formatISO(stat.birthtime),
        birthtime: stat.birthtime,
      };
    })
    .filter((e) => !showToday || isToday(e.birthtime))
    .map(({ birthtime: _birthtime, ...rest }) => rest);

  res.json(entries);
});
