export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface ResolvedPackage {
  name: string;
  version: string;
}

export interface AuditSeverityCounts {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

export interface AuditReport {
  severities: AuditSeverityCounts;
  highPackages: Array<{ name: string; version: string }>;
  criticalPackages: Array<{ name: string; version: string }>;
}

export interface ResolverResult {
  packages: ResolvedPackage[];
  audit: AuditReport;
}

export interface PackageMetadata {
  startedAt: string;
  completedAt: string;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  audit: AuditReport;
  packages: Array<{
    name: string;
    version: string;
    tarball: string;
  }>;
  failedPackages: Array<{
    name: string;
    version: string;
    error?: string;
  }>;
}
