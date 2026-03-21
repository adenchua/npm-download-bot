import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { AuditReport, AuditSeverityCounts, PackageJson, ResolvedPackage, ResolverResult } from './types';

export async function resolveAllDependencies(packageJsonPath: string): Promise<ResolverResult> {
  const raw = fs.readFileSync(packageJsonPath, 'utf-8');
  const parsed: PackageJson = JSON.parse(raw);

  const merged: Record<string, string> = {
    ...parsed.dependencies,
    ...parsed.devDependencies,
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-resolver-'));

  try {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'resolver-tmp', version: '1.0.0', dependencies: merged }, null, 2)
    );

    console.log('Installing dependencies to resolve full tree...');
    execSync('npm install --ignore-scripts --no-audit --no-fund', {
      cwd: tmpDir,
      stdio: 'inherit',
    });

    const seen = new Set<string>();
    const results: ResolvedPackage[] = [];

    function walkNodeModules(nodeModulesDir: string): void {
      if (!fs.existsSync(nodeModulesDir)) return;

      for (const entry of fs.readdirSync(nodeModulesDir)) {
        const entryPath = path.join(nodeModulesDir, entry);

        if (entry.startsWith('@')) {
          // Scoped package — walk one level deeper
          if (fs.statSync(entryPath).isDirectory()) {
            for (const scoped of fs.readdirSync(entryPath)) {
              collectPackage(path.join(entryPath, scoped));
            }
          }
        } else if (!entry.startsWith('.')) {
          collectPackage(entryPath);
        }
      }
    }

    function collectPackage(pkgDir: string): void {
      if (!fs.statSync(pkgDir).isDirectory()) return;

      const pkgJsonPath = path.join(pkgDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
          const key = `${pkg.name}@${pkg.version}`;
          if (pkg.name && pkg.version && !seen.has(key)) {
            seen.add(key);
            results.push({ name: pkg.name, version: pkg.version });
          }
        } catch {
          // skip malformed package.json
        }
      }

      // Recurse into nested node_modules (edge cases)
      const nested = path.join(pkgDir, 'node_modules');
      if (fs.existsSync(nested)) {
        walkNodeModules(nested);
      }
    }

    walkNodeModules(path.join(tmpDir, 'node_modules'));

    console.log('Running vulnerability audit...');
    const audit = runAudit(tmpDir, results);
    return { packages: results, audit };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

interface NpmAuditJson {
  vulnerabilities?: Record<string, { name: string; severity: string }>;
  metadata?: { vulnerabilities: AuditSeverityCounts };
}

function runAudit(cwd: string, resolvedPackages: ResolvedPackage[]): AuditReport {
  let rawJson: string;
  try {
    rawJson = execSync('npm audit --json', {
      cwd,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch (err: unknown) {
    // npm audit exits code 1 when vulnerabilities are found — stdout is still valid JSON
    const e = err as { stdout?: Buffer };
    if (!e.stdout) {
      console.warn('  npm audit failed to execute — skipping');
      return emptyAuditReport();
    }
    rawJson = e.stdout.toString();
  }

  try {
    const parsed = JSON.parse(rawJson) as NpmAuditJson;
    const severities: AuditSeverityCounts = parsed.metadata?.vulnerabilities ??
      { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };

    const versionMap = new Map(resolvedPackages.map(p => [p.name, p.version]));
    const highPackages: AuditReport['highPackages'] = [];
    const criticalPackages: AuditReport['criticalPackages'] = [];

    for (const [name, vuln] of Object.entries(parsed.vulnerabilities ?? {})) {
      const version = versionMap.get(name) ?? 'unknown';
      if (vuln.severity === 'high') highPackages.push({ name, version });
      if (vuln.severity === 'critical') criticalPackages.push({ name, version });
    }

    return { severities, highPackages, criticalPackages };
  } catch {
    console.warn('  Failed to parse npm audit output — skipping');
    return emptyAuditReport();
  }
}

function emptyAuditReport(): AuditReport {
  return {
    severities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    highPackages: [],
    criticalPackages: [],
  };
}
