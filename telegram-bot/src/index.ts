import { Telegraf, Scenes, session } from 'telegraf';
import { connectDb, closeDb } from './db';
import { registerClient, getClientByTelegramId, verifyIndexes as verifyClientIndexes } from './db/clients';
import { verifyIndexes as verifySubscriberIndexes } from './db/subscribers';
import { approveClientScene, APPROVE_SCENE_ID } from './commands/approveClient';
import { subscribeScene, unsubscribeScene, SUBSCRIBE_SCENE_ID, UNSUBSCRIBE_SCENE_ID } from './commands/subscribe';
import { requestScene, REQUEST_SCENE_ID } from './commands/request';
import { BotContext } from './commands/helpers';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

const bot = new Telegraf<BotContext>(token);

const stage = new Scenes.Stage<BotContext>([approveClientScene, subscribeScene, unsubscribeScene, requestScene]);
bot.use(session());

bot.command('cancel', async (ctx) => {
  const wizardSession = ctx.session as Scenes.WizardSession;
  if (wizardSession.__scenes?.current) {
    delete wizardSession.__scenes.current;
    await ctx.reply('Conversation cancelled.');
  } else {
    await ctx.reply('No active conversation to cancel.');
  }
});

bot.use(stage.middleware());

bot.start((ctx) => ctx.reply('Welcome! Use /help to see available commands.'));
bot.help((ctx) =>
  ctx.reply(
    'Available commands:\n' +
      '/start — Welcome message\n' +
      '/register — Register your account\n' +
      '/request — Submit a package.json to download npm packages\n' +
      '/subscribe — Subscribe to notifications (admin)\n' +
      '/unsubscribe — Unsubscribe from notifications (admin)\n' +
      '/approve_client — Approve a registered client (admin)\n' +
      '/cancel — Cancel the current conversation\n' +
      '/help — Show this message',
  ),
);

bot.command('register', async (ctx) => {
  const { id, username } = ctx.from;
  const isNew = await registerClient({
    telegramId: id,
    username,
    registeredAt: new Date(),
    isApproved: false,
  });
  await ctx.reply(
    isNew
      ? 'You have been registered! An admin will review your request.'
      : 'You are already registered.',
  );
});

bot.command('approve_client', (ctx) => ctx.scene.enter(APPROVE_SCENE_ID));
bot.command('subscribe', (ctx) => ctx.scene.enter(SUBSCRIBE_SCENE_ID));
bot.command('unsubscribe', (ctx) => ctx.scene.enter(UNSUBSCRIBE_SCENE_ID));
bot.command('request', async (ctx) => {
  const client = await getClientByTelegramId(ctx.from.id);
  if (!client) {
    await ctx.reply('You are not registered. Use /register first.');
    return;
  }
  if (!client.isApproved) {
    await ctx.reply('Your account has not been approved yet. Please wait for an admin to approve you.');
    return;
  }
  return ctx.scene.enter(REQUEST_SCENE_ID);
});

async function main() {
  if (!process.env.APPROVE_SECRET) {
    throw new Error('APPROVE_SECRET is not set');
  }
  if (!process.env.NPM_DOWNLOAD_SERVICE_URL) {
    throw new Error('NPM_DOWNLOAD_SERVICE_URL is not set');
  }
  await connectDb();
  await verifyClientIndexes();
  await verifySubscriberIndexes();
  bot.launch();
  console.log('Telegram bot is running');
}

async function shutdown(signal: string) {
  bot.stop(signal);
  await closeDb();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main();
