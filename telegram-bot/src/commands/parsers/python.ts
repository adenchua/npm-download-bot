import toml from "@iarna/toml";

// pypi.org/project/<name>/ or pypi.org/project/<name>/<version>/
const PYPI_URL_REGEX = /^https?:\/\/(?:www\.)?pypi\.org\/project\/([a-zA-Z0-9][a-zA-Z0-9._-]*)(?:\/([^/\s]+))?\/?$/;

// PEP 508 package name — no shell metacharacters
const PYPI_NAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
// Allowed characters in version specifiers
const VERSION_SPEC_REGEX = /^[a-zA-Z0-9.*+!<>=,\s~^_-]+$/;

// Converts a poetry-style version spec to pip-compatible format.
// ^X.Y.Z → >=X.Y.Z,<(X+1).0.0
// ~X.Y.Z → >=X.Y.Z,<X.(Y+1).0
// *       → * (no constraint)
// other   → pass through as-is
function poetrySpecToPip(spec: string): string {
  const trimmed = spec.trim();

  const caretMatch = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  if (caretMatch) {
    const major = parseInt(caretMatch[1], 10);
    const minor = parseInt(caretMatch[2], 10);
    const patch = parseInt(caretMatch[3], 10);
    return `>=${major}.${minor}.${patch},<${major + 1}.0.0`;
  }

  const caretShortMatch = /^\^(\d+)\.(\d+)$/.exec(trimmed);
  if (caretShortMatch) {
    const major = parseInt(caretShortMatch[1], 10);
    const minor = parseInt(caretShortMatch[2], 10);
    return `>=${major}.${minor},<${major + 1}.0.0`;
  }

  const caretMajorMatch = /^\^(\d+)$/.exec(trimmed);
  if (caretMajorMatch) {
    const major = parseInt(caretMajorMatch[1], 10);
    return `>=${major},<${major + 1}`;
  }

  const tildeMatch = /^~(\d+)\.(\d+)\.(\d+)$/.exec(trimmed);
  if (tildeMatch) {
    const major = parseInt(tildeMatch[1], 10);
    const minor = parseInt(tildeMatch[2], 10);
    const patch = parseInt(tildeMatch[3], 10);
    return `>=${major}.${minor}.${patch},<${major}.${minor + 1}.0`;
  }

  const tildeShortMatch = /^~(\d+)\.(\d+)$/.exec(trimmed);
  if (tildeShortMatch) {
    const major = parseInt(tildeShortMatch[1], 10);
    const minor = parseInt(tildeShortMatch[2], 10);
    return `>=${major}.${minor},<${major}.${minor + 1}.0`;
  }

  return trimmed;
}

// Returns { requirements } if text is a valid PyPI URL, else null.
export function parsePyPIUrl(text: string): { requirements: Record<string, string> } | null {
  const stripped = text.trim().split("?")[0].split("#")[0];
  const match = PYPI_URL_REGEX.exec(stripped);
  if (!match) return null;

  const name = match[1];
  if (!PYPI_NAME_REGEX.test(name)) return null;

  const version = match[2];
  if (version !== undefined && !VERSION_SPEC_REGEX.test(version)) return null;

  const versionSpec = version ? `==${version}` : "*";
  return { requirements: { [name]: versionSpec } };
}

// Parses requirements.txt content. Returns { requirements } or null if no valid package lines found.
export function parseRequirementsTxt(text: string): { requirements: Record<string, string> } | null {
  const requirements: Record<string, string> = {};

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    // Skip blank lines, comments, and option lines
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;

    // Strip inline comments
    const withoutComment = line.split("#")[0].trim();
    if (!withoutComment) continue;

    // PEP 508: name[extras] version_spec ; env_marker
    // Strip environment markers
    const withoutMarker = withoutComment.split(";")[0].trim();

    // Extract package name (before any extras bracket or version specifier)
    const nameMatch = /^([a-zA-Z0-9][a-zA-Z0-9._-]*)/.exec(withoutMarker);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    if (!PYPI_NAME_REGEX.test(name)) continue;

    // Extract version spec (everything after the name and optional extras)
    const afterName = withoutMarker.slice(nameMatch[0].length);
    const afterExtras = afterName.replace(/^\[.*?\]/, "").trim();
    const versionSpec = afterExtras || "*";

    if (versionSpec !== "*" && !VERSION_SPEC_REGEX.test(versionSpec)) continue;

    requirements[name] = versionSpec;
  }

  if (Object.keys(requirements).length === 0) return null;
  return { requirements };
}

// Parses a pyproject.toml file (poetry format only).
// Returns { requirements, devRequirements } or null if not a poetry project.
export function parsePyprojectToml(
  text: string,
): { requirements: Record<string, string>; devRequirements: Record<string, string> } | null {
  let parsed: toml.JsonMap;
  try {
    parsed = toml.parse(text);
  } catch {
    return null;
  }

  const tool = parsed.tool as Record<string, unknown> | undefined;
  if (!tool) return null;

  const poetry = tool.poetry as Record<string, unknown> | undefined;
  if (!poetry) return null;

  const mainDeps = poetry.dependencies as Record<string, unknown> | undefined;
  if (!mainDeps) return null;

  const requirements: Record<string, string> = {};
  const devRequirements: Record<string, string> = {};

  function extractDeps(source: Record<string, unknown>, target: Record<string, string>): void {
    for (const [pkgName, value] of Object.entries(source)) {
      // Skip the python version constraint
      if (pkgName === "python") continue;
      if (!PYPI_NAME_REGEX.test(pkgName)) continue;

      let spec: string;
      if (typeof value === "string") {
        spec = poetrySpecToPip(value);
      } else if (typeof value === "object" && value !== null && "version" in value) {
        const versionValue = (value as Record<string, unknown>).version;
        spec = typeof versionValue === "string" ? poetrySpecToPip(versionValue) : "*";
      } else {
        spec = "*";
      }

      target[pkgName] = spec;
    }
  }

  extractDeps(mainDeps, requirements);

  // Legacy [tool.poetry.dev-dependencies]
  const legacyDev = poetry["dev-dependencies"] as Record<string, unknown> | undefined;
  if (legacyDev) {
    extractDeps(legacyDev, devRequirements);
  }

  // [tool.poetry.group.*.dependencies]
  const groups = poetry.group as Record<string, unknown> | undefined;
  if (groups) {
    for (const groupValue of Object.values(groups)) {
      if (typeof groupValue !== "object" || groupValue === null) continue;
      const groupDeps = (groupValue as Record<string, unknown>).dependencies as Record<string, unknown> | undefined;
      if (groupDeps) {
        extractDeps(groupDeps, devRequirements);
      }
    }
  }

  if (Object.keys(requirements).length === 0 && Object.keys(devRequirements).length === 0) return null;

  return { requirements, devRequirements };
}
