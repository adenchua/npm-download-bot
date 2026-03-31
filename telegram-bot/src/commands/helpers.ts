import { Scenes } from "telegraf";

export type BotContext = Scenes.WizardContext;

export const MAX_PACKAGE_JSON_BYTES = 100 * 1024; // 100 KB

export const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "text/plain",
  "text/json",
  "application/octet-stream", // many Telegram clients send this for unknown types
]);

// Parses and validates a package.json string. Returns a field-allowlisted object
// or null if the input is invalid (unparseable, wrong shape, non-string dep values).
export function parseAndValidatePackageJson(text: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (!p.dependencies && !p.devDependencies && !p.peerDependencies) return null;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const val = p[field];
    if (val === undefined) continue;
    if (typeof val !== "object" || val === null || Array.isArray(val)) return null;
    if (Object.values(val as object).some((v) => typeof v !== "string")) return null;
  }
  return Object.fromEntries(
    (["name", "version", "dependencies", "devDependencies", "peerDependencies"] as const)
      .filter((k) => p[k] !== undefined)
      .map((k) => [k, p[k]]),
  );
}

// Read once at module load; validated at bot startup via main().
const secret = process.env.APPROVE_SECRET!;

export function getText(ctx: BotContext): string | null {
  const msg = ctx.message;
  return msg && "text" in msg ? msg.text : null;
}

// Returns the text or null — replies "Please send text." and stays in the step.
export async function requireText(ctx: BotContext): Promise<string | null> {
  const text = getText(ctx);
  if (!text) {
    await ctx.reply("Please send text.");
    return null;
  }
  return text;
}

// Returns true if the secret matches. On failure replies, leaves the scene, returns false.
export async function checkSecret(ctx: BotContext, text: string): Promise<boolean> {
  if (text !== secret) {
    await ctx.reply("Incorrect secret.");
    await ctx.scene.leave();
    return false;
  }
  return true;
}
