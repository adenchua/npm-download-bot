import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { format, formatISO, isToday } from 'date-fns';
import { PackageJson } from '../types';

const INPUT_DIR = path.resolve('input');

export const filesRouter = Router();

// POST /upload — body is a package.json object
filesRouter.post('/upload', async (req: Request, res: Response) => {
  const body = req.body as PackageJson;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'Request body must be a JSON object' });
    return;
  }

  if (!body.dependencies && !body.devDependencies) {
    res.status(422).json({
      error: 'package.json must contain at least one of: dependencies, devDependencies',
    });
    return;
  }

  const datePrefix = format(new Date(), 'yyyyMMdd');
  const todayCount = fs.readdirSync(INPUT_DIR).filter((f) => f.startsWith(datePrefix) && f.endsWith('.json')).length;
  const id = `${datePrefix}-${format(new Date(), 'HHmm')}-${todayCount + 1}`;
  fs.writeFileSync(path.join(INPUT_DIR, `${id}.json`), JSON.stringify(body, null, 2));

  res.status(201).json({ id });
});

// GET /files — list all uploaded package.json files
// Query params: showToday=true — only return files created today
filesRouter.get('/files', async (req: Request, res: Response) => {
  const showToday = req.query.showToday === 'true';

  const entries = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const stat = fs.statSync(path.join(INPUT_DIR, f));
      return {
        id: path.basename(f, '.json'),
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
