import { Scenes } from "telegraf";

export type BotContext = Scenes.WizardContext;

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
