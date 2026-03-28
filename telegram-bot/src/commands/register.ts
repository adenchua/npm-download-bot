import { registerClient } from "../db/clients";
import { BotContext } from "./helpers";

export async function registerCommand(ctx: BotContext): Promise<void> {
  const { id, username, first_name, last_name } = ctx.from!;
  const isNew = await registerClient({
    telegramId: id,
    username,
    firstName: first_name,
    lastName: last_name,
    registeredAt: new Date(),
    isApproved: false,
  });
  await ctx.reply(
    isNew ? "You have been registered! An admin will review your request." : "You are already registered.",
  );
}
