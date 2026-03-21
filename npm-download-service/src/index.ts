#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { select } from '@inquirer/prompts';
import { resolveAllDependencies } from './resolver';
import { downloadAndZip } from './downloader';

async function main() {
  const inputDir = path.resolve('input');

  if (!fs.existsSync(inputDir)) {
    console.error(`input/ directory not found at ${inputDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(inputDir, f));

  if (files.length === 0) {
    console.log('No .json files found in input/');
    return;
  }

  // Step 1: action select
  const action = await select({
    message: 'What would you like to do?',
    choices: [
      {
        name: `Download all files (${files.length} found)`,
        value: 'all',
      },
      {
        name: 'Download a specific file',
        value: 'specific',
      },
    ],
  });

  // Step 2: file select (only if 'specific')
  let targets: string[];
  if (action === 'specific') {
    const chosen = await select({
      message: 'Select a file to download:',
      choices: files.map(f => ({
        name: path.basename(f),
        value: f,
      })),
    });
    targets = [chosen];
  } else {
    targets = files;
  }

  // Process targets
  for (const file of targets) {
    const id = path.basename(file, '.json');
    console.log(`\n[${id}] Resolving dependencies...`);

    const { packages, audit } = await resolveAllDependencies(file);
    console.log(`[${id}] Resolved ${packages.length} packages`);
    console.log(`[${id}] Audit: ${audit.severities.total} vulnerabilities (high: ${audit.severities.high}, critical: ${audit.severities.critical})`);

    console.log(`[${id}] Downloading packages...`);
    await downloadAndZip(packages, id, audit);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
