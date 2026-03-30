import archiver from "archiver";
import { formatISO } from "date-fns";

import { createWriteStream, mkdirSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { exec } from "child_process";
import { promisify } from "util";

import { AuditReport, PackageMetadata, ResolvedPackage } from "./types";

const execAsync = promisify(exec);

function tarballName(name: string, version: string): string {
  // @scope/pkg -> scope-pkg-<version>.tgz
  // pkg        -> pkg-<version>.tgz
  const flat = name.startsWith("@") ? name.slice(1).replace("/", "-") : name;
  return `${flat}-${version}.tgz`;
}

export async function downloadAndZip(packages: ResolvedPackage[], id: string, audit: AuditReport): Promise<void> {
  const outputDir = resolve("output");
  mkdirSync(outputDir, { recursive: true });

  const tmpDir = mkdtempSync(join(tmpdir(), `npm-pack-${id}-`));

  let succeeded = 0;
  let failed = 0;
  const downloaded: PackageMetadata["packages"] = [];
  const failedPackages: PackageMetadata["failedPackages"] = [];
  const startedAt = formatISO(new Date());

  try {
    for (const pkg of packages) {
      const ref = `${pkg.name}@${pkg.version}`;
      try {
        await execAsync(`npm pack ${ref} --pack-destination "${tmpDir}"`, {
          maxBuffer: 1024 * 1024 * 1024,
        });
        const tarball = tarballName(pkg.name, pkg.version);
        downloaded.push({ name: pkg.name, version: pkg.version, tarball });
        console.log(`  ✓ ${ref}`);
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
        console.error(`  ✗ Failed: ${ref} — ${message}`);
        failedPackages.push({
          name: pkg.name,
          version: pkg.version,
          error: message,
        });
        failed++;
      }
    }

    console.log(`\nDownloaded ${succeeded}/${packages.length} packages (${failed} failed)`);

    const metadata: PackageMetadata = {
      startedAt,
      completedAt: formatISO(new Date()),
      summary: {
        total: packages.length,
        succeeded,
        failed,
      },
      packages: downloaded,
      failedPackages,
      audit,
    };

    const zipPath = join(outputDir, `${id}.zip`);
    await createZip(tmpDir, metadata, zipPath);
    console.log(`→ ${zipPath}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function createZip(tgzDir: string, metadata: PackageMetadata, zipPath: string): Promise<void> {
  return new Promise((resolveZip, rejectZip) => {
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", resolveZip);
    archive.on("error", rejectZip);

    archive.pipe(output);

    // Add all .tgz files
    const tgzFiles = readdirSync(tgzDir).filter((f) => f.endsWith(".tgz"));
    for (const file of tgzFiles) {
      archive.file(join(tgzDir, file), { name: file });
    }

    // Add metadata.json
    archive.append(JSON.stringify(metadata, null, 2), {
      name: "metadata.json",
    });

    archive.finalize();
  });
}
