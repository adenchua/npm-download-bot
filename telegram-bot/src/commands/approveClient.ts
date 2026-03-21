import { Scenes } from 'telegraf';
import { approveClient } from '../db/clients';
import { BotContext, requireText, checkSecret } from './helpers';

export const APPROVE_SCENE_ID = 'approve_client';

export const approveClientScene = new Scenes.WizardScene<BotContext>(
  APPROVE_SCENE_ID,

  // Step 1 — prompt for secret
  async (ctx) => {
    await ctx.reply('Enter the admin secret:');
    return ctx.wizard.next();
  },

  // Step 2 — validate secret
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    if (!await checkSecret(ctx, text)) return;
    await ctx.reply('Enter the Telegram ID (number) or username (without @):');
    return ctx.wizard.next();
  },

  // Step 3 — look up and approve
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    const numericId = Number(text);
    const filter = isNaN(numericId) ? { username: text } : { telegramId: numericId };
    const approved = await approveClient(filter);
    await ctx.reply(
      approved ? 'Client approved.' : 'No registered client found with that ID or username.',
    );
    return ctx.scene.leave();
  },
);
