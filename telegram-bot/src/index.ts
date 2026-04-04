import { Telegraf, Scenes, session } from "telegraf";

import { connectDb, closeDb } from "./db";
import { getClientByTelegramId, verifyIndexes as verifyClientIndexes } from "./db/clients";
import { verifyIndexes as verifySubscriberIndexes } from "./db/subscribers";
import { verifyIndexes as verifyJobIndexes } from "./db/jobs";
import { registerCommand } from "./commands/register";
import { approveClientScene, APPROVE_SCENE_ID } from "./commands/approveClient";
import { notifyClientScene, NOTIFY_CLIENT_SCENE_ID } from "./commands/notifyClient";
import { subscribeScene, unsubscribeScene, SUBSCRIBE_SCENE_ID, UNSUBSCRIBE_SCENE_ID } from "./commands/subscribe";
import { requestScene, REQUEST_SCENE_ID, processPackageJsonRequest, processNpmUrlRequest } from "./commands/request";
import { BotContext, MAX_PACKAGE_JSON_BYTES, ALLOWED_MIME_TYPES, parseAndValidatePackageJson, parseNpmUrl } from "./commands/helpers";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set");
}

const bot = new Telegraf<BotContext>(token);

const stage = new Scenes.Stage<BotContext>([approveClientScene, notifyClientScene, subscribeScene, unsubscribeScene, requestScene]);
bot.use(session());

bot.command("cancel", async (ctx) => {
  const wizardSession = ctx.session as Scenes.WizardSession;
  if (wizardSession.__scenes?.current) {
    delete wizardSession.__scenes.current;
    await ctx.reply("Conversation cancelled.");
  } else {
    await ctx.reply("No active conversation to cancel.");
  }
});

bot.use(stage.middleware());

bot.start((ctx) => ctx.reply("Welcome! Use /help to see available commands."));
bot.help((ctx) =>
  ctx.reply(
    "Available commands:\n" +
      "/start — Welcome message\n" +
      "/register — Register your account\n" +
      "/request — Submit a package.json to download npm packages\n" +
      "/cancel — Cancel the current conversation\n" +
      "/help — Show this message",
  ),
);

bot.command("register", registerCommand);
bot.command("approve_client", (ctx) => ctx.scene.enter(APPROVE_SCENE_ID));
bot.command("notify_client", (ctx) => ctx.scene.enter(NOTIFY_CLIENT_SCENE_ID));
bot.command("subscribe", (ctx) => ctx.scene.enter(SUBSCRIBE_SCENE_ID));
bot.command("unsubscribe", (ctx) => ctx.scene.enter(UNSUBSCRIBE_SCENE_ID));
bot.command("request", async (ctx) => {
  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) {
    await ctx.reply("You are not registered. Use /register first.");
    return;
  }
  if (!client.isApproved) {
    await ctx.reply("Your account has not been approved yet. Please wait for an admin to approve you.");
    return;
  }
  return ctx.scene.enter(REQUEST_SCENE_ID);
});

bot.on("message", async (ctx) => {
  const wizardSession = ctx.session as Scenes.WizardSession;
  if (wizardSession.__scenes?.current) return;

  const msg = ctx.message;
  const isDocument = "document" in msg;
  const isJsonText = "text" in msg && msg.text.trimStart().startsWith("{");
  const npmUrlParsed = "text" in msg ? parseNpmUrl(msg.text) : null;
  if (!isDocument && !isJsonText && !npmUrlParsed) return;

  const client = await getClientByTelegramId(ctx.from!.id);
  if (!client) {
    await ctx.reply("You are not registered. Use /register first.");
    return;
  }
  if (!client.isApproved) {
    await ctx.reply("Your account has not been approved yet. Please wait for an admin to approve you.");
    return;
  }

  if (npmUrlParsed) {
    await processNpmUrlRequest(ctx, npmUrlParsed.name, npmUrlParsed.version);
    return;
  }

  let pkg: Record<string, unknown> | null = null;

  if (isDocument) {
    const { file_size, mime_type, file_name } = msg.document;
    if (file_size && file_size > MAX_PACKAGE_JSON_BYTES) return;
    const mime = mime_type ?? "";
    const ext = (file_name ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (mime && !ALLOWED_MIME_TYPES.has(mime) && ext !== "json" && ext !== "txt") return;
    const fileLink = await ctx.telegram.getFileLink(msg.document.file_id);
    const res = await fetch(fileLink.href);
    const text = await res.text();
    if (text.length > MAX_PACKAGE_JSON_BYTES) return;
    pkg = parseAndValidatePackageJson(text);
  } else if (isJsonText) {
    pkg = parseAndValidatePackageJson(msg.text);
  }

  if (!pkg) return;

  await processPackageJsonRequest(ctx, pkg);
});

async function main() {
  if (!process.env.APPROVE_SECRET) {
    throw new Error("APPROVE_SECRET is not set");
  }
  if (!process.env.NPM_DOWNLOAD_SERVICE_URL) {
    throw new Error("NPM_DOWNLOAD_SERVICE_URL is not set");
  }
  await connectDb();
  await verifyClientIndexes();
  await verifySubscriberIndexes();
  await verifyJobIndexes();
  bot.launch();
  console.log("Telegram bot is running");
}

async function shutdown(signal: string) {
  bot.stop(signal);
  await closeDb();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

main();
