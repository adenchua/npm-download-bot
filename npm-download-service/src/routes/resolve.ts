import semver from "semver";

import { Router, Request, Response } from "express";

import { PackageJson } from "../types";
import { resolveVersionRange } from "../resolver";

export const resolveRouter = Router();

// POST /resolve — given a package.json, return resolved latest versions
resolveRouter.post("/resolve", async (req: Request, res: Response) => {
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

  const b = body as Record<string, unknown>;
  const sanitized = Object.fromEntries(
    ["name", "version", "dependencies", "devDependencies", "peerDependencies"]
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, b[k]]),
  ) as PackageJson;

  const result: PackageJson = {};
  if (sanitized.name) result.name = sanitized.name;
  if (sanitized.version) result.version = sanitized.version;

  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    if (!sanitized[field]) continue;
    const entries = Object.entries(sanitized[field]!);
    const resolved = await Promise.all(
      entries.map(async ([name, version]): Promise<[string, string]> => {
        if (semver.valid(version)) return [name, version];
        const latest = await resolveVersionRange(name, version);
        return [name, latest ?? version];
      }),
    );
    result[field] = Object.fromEntries(resolved);
  }

  res.json(result);
});
