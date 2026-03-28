import { Scenes } from "telegraf";

import { getAllSubscribers } from "../db/subscribers";
import { BotContext } from "./helpers";

export const REQUEST_SCENE_ID = "request";

const serviceUrl = process.env.NPM_DOWNLOAD_SERVICE_URL!;

// Reads the message as either a document download or inline text, parses and
// validates the JSON, and returns the object or null (having already replied).
async function resolvePackageJson(ctx: BotContext): Promise<Record<string, unknown> | null> {
  const msg = ctx.message;
  if (!msg) return null;

  let jsonText: string;

  if ("document" in msg) {
    const fileLink = await ctx.telegram.getFileLink(msg.document.file_id);
    const res = await fetch(fileLink.href);
    jsonText = await res.text();
  } else if ("text" in msg) {
    jsonText = msg.text;
  } else {
    await ctx.reply("Please send a package.json file or paste the JSON text.");
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    await ctx.reply("Invalid JSON. Please send a valid package.json.");
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    await ctx.reply("Invalid package.json format.");
    return null;
  }

  const pkg = parsed as Record<string, unknown>;
  if (!pkg.dependencies && !pkg.devDependencies) {
    await ctx.reply("The package.json must contain at least one of: dependencies, devDependencies.");
    return null;
  }

  return pkg;
}

export async function processPackageJsonRequest(ctx: BotContext, pkg: Record<string, unknown>): Promise<void> {
  let id: string;
  try {
    const uploadRes = await fetch(`${serviceUrl}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pkg),
    });
    if (!uploadRes.ok) throw new Error(`HTTP ${uploadRes.status}`);
    ({ id } = (await uploadRes.json()) as { id: string });
  } catch (err) {
    console.error("Upload error:", err);
    await ctx.reply("Failed to upload package.json. Please try again later.");
    return;
  }

  try {
    await fetch(`${serviceUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch (err) {
    console.error("Job start error:", err);
  }

  await ctx.reply(`Job started! Your download ID is:\n\`${id}\``, {
    parse_mode: "Markdown",
  });

  const subscribers = await getAllSubscribers();
  const notification = `New download job started by @${ctx.from!.username ?? ctx.from!.id}:\n\`${id}\``;
  await Promise.allSettled(
    subscribers.map((s) =>
      ctx.telegram.sendMessage(s.telegramId, notification, {
        parse_mode: "Markdown",
      }),
    ),
  );
}

export const requestScene = new Scenes.WizardScene<BotContext>(
  REQUEST_SCENE_ID,

  // Step 1 — prompt for package.json
  async (ctx) => {
    await ctx.reply("Please send your package.json as a file or paste the JSON text.");
    return ctx.wizard.next();
  },

  // Step 2 — validate, upload, start job
  async (ctx) => {
    const pkg = await resolvePackageJson(ctx);
    if (pkg === null) return;
    await processPackageJsonRequest(ctx, pkg);
    return ctx.scene.leave();
  },
);
