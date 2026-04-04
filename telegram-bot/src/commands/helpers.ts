import { Scenes } from "telegraf";

import { ClientDocument } from "../db/clients";

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

export const CALLBACK_PREFIXES = {
  SELECT_CLIENT: "select:",
  CONFIRM_ACTION: "confirm:",
  SELECT_JOB: "job:",
  SELECT_OUTCOME: "outcome:",
} as const;

export function formatClientName(client: ClientDocument): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ");
}

// Validates a callback query with the given prefix. On success, answers the query and
// returns the data string after the prefix. On failure, replies with errorMsg and returns null.
export async function requireCallbackData(ctx: BotContext, prefix: string, errorMsg: string): Promise<string | null> {
  const cbq = ctx.callbackQuery;
  if (!cbq || !("data" in cbq) || !cbq.data.startsWith(prefix)) {
    await ctx.reply(errorMsg);
    return null;
  }
  await ctx.answerCbQuery();
  return cbq.data.slice(prefix.length);
}

// Shared first wizard step for all admin-gated scenes.
export const SECRET_PROMPT_STEP = async (ctx: BotContext) => {
  await ctx.reply("Enter the admin secret:");
  return ctx.wizard.next();
};

const NPMJS_URL_REGEX =
  /^https?:\/\/(?:www\.)?npmjs\.com\/package\/((?:@[^/\s]+\/[^/\s]+)|(?:[^@/\s][^/\s]*))(?:\/v\/([^\s/]+))?$/;

// Valid npm package names: lowercase, URL-safe, optional @scope/name format.
const NPM_NAME_REGEX = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
// Valid npm version in a URL context: exact semver or dist-tag (no shell metacharacters).
const NPM_VERSION_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._+\-]*$/;

// Returns { name, version } if text is an npmjs.com package URL, else null.
// Query string and fragment are stripped before matching.
// Version defaults to "latest" when no /v/<version> segment is present.
export function parseNpmUrl(text: string): { name: string; version: string } | null {
  const stripped = text.trim().split("?")[0].split("#")[0];
  const match = NPMJS_URL_REGEX.exec(stripped);
  if (!match) return null;
  const name = match[1];
  const version = match[2] ?? "latest";
  if (name.length > 214 || !NPM_NAME_REGEX.test(name)) return null;
  if (version.length > 64 || !NPM_VERSION_REGEX.test(version)) return null;
  return { name, version };
}
