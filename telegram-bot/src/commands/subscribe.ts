import { Scenes } from "telegraf";

import { addSubscriber, removeSubscriber } from "../db/subscribers";
import { BotContext, requireText, checkSecret } from "./helpers";

export const SUBSCRIBE_SCENE_ID = "subscribe";
export const UNSUBSCRIBE_SCENE_ID = "unsubscribe";

export const subscribeScene = new Scenes.WizardScene<BotContext>(
  SUBSCRIBE_SCENE_ID,

  // Step 1 — prompt for secret
  async (ctx) => {
    await ctx.reply("Enter the admin secret:");
    return ctx.wizard.next();
  },

  // Step 2 — validate secret, then subscribe
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    if (!(await checkSecret(ctx, text))) return;
    const { id, username } = ctx.from!;
    const isNew = await addSubscriber({
      telegramId: id,
      username,
      subscribedAt: new Date(),
    });
    await ctx.reply(isNew ? "You are now subscribed to notifications." : "You are already subscribed.");
    return ctx.scene.leave();
  },
);

export const unsubscribeScene = new Scenes.WizardScene<BotContext>(
  UNSUBSCRIBE_SCENE_ID,

  // Step 1 — prompt for secret
  async (ctx) => {
    await ctx.reply("Enter the admin secret:");
    return ctx.wizard.next();
  },

  // Step 2 — validate secret, then unsubscribe
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    if (!(await checkSecret(ctx, text))) return;
    const removed = await removeSubscriber(ctx.from!.id);
    await ctx.reply(removed ? "You have been unsubscribed." : "You are not currently subscribed.");
    return ctx.scene.leave();
  },
);
