export interface PythonPayload {
  requirements?: Record<string, string>;
  devRequirements?: Record<string, string>;
  platforms?: string[];
  pythonVersions?: string[];
}

export interface DownloadTarget {
  platform: string;
  pythonVersion: string;
}

export interface FailedTarget {
  platform: string;
  pythonVersion: string;
  error: string;
}

export interface AuditSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export interface PythonMetadata {
  startedAt: string;
  completedAt: string;
  summary: {
    totalTargets: number;
    succeededTargets: number;
    failedTargets: number;
  };
  files: string[];
  failedTargets: FailedTarget[];
  audit: AuditSeverityCounts;
}
