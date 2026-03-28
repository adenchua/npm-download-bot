import { Scenes, Markup } from "telegraf";
import { format } from "date-fns";

import { approveClient, getClientByTelegramId, getPendingClients, ClientDocument } from "../db/clients";
import { BotContext, requireText, checkSecret } from "./helpers";

export const APPROVE_SCENE_ID = "approve_client";

interface ApproveState {
  selectedTelegramId?: number;
}

function clientButtonLabel(client: ClientDocument): string {
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const handle = client.username ? ` (@${client.username})` : "";
  const date = format(client.registeredAt, "dd MMM yyyy");
  return `${name}${handle} — ${date}`;
}

function clientConfirmText(client: ClientDocument): string {
  const name = [client.firstName, client.lastName].filter(Boolean).join(" ");
  const lines = ["Approve this client?\n", `ID: ${client.telegramId}`, `Name: ${name}`];
  if (client.username) lines.push(`Username: @${client.username}`);
  lines.push(`Registered: ${format(client.registeredAt, "dd MMM yyyy HH:mm")}`);
  return lines.join("\n");
}

export const approveClientScene = new Scenes.WizardScene<BotContext>(
  APPROVE_SCENE_ID,

  // Step 1 — prompt for secret
  async (ctx) => {
    await ctx.reply("Enter the admin secret:");
    return ctx.wizard.next();
  },

  // Step 2 — validate secret, show pending clients
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    if (!(await checkSecret(ctx, text))) return;

    const pending = await getPendingClients(5);
    if (pending.length === 0) {
      await ctx.reply("No pending registrations.");
      return ctx.scene.leave();
    }

    const buttons = pending.map((client) => [
      Markup.button.callback(clientButtonLabel(client), `select:${client.telegramId}`),
    ]);
    await ctx.reply("Select a client to approve:", Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },

  // Step 3 — handle client selection
  async (ctx) => {
    const cbq = ctx.callbackQuery;
    if (!cbq || !("data" in cbq) || !cbq.data.startsWith("select:")) {
      await ctx.reply("Please select a client from the list above.");
      return;
    }
    await ctx.answerCbQuery();

    const telegramId = parseInt(cbq.data.slice("select:".length), 10);
    const client = await getClientByTelegramId(telegramId);
    if (!client) {
      await ctx.reply("Client not found.");
      return ctx.scene.leave();
    }

    (ctx.wizard.state as ApproveState).selectedTelegramId = telegramId;

    await ctx.reply(
      clientConfirmText(client),
      Markup.inlineKeyboard([
        [Markup.button.callback("Yes", "confirm:yes"), Markup.button.callback("No", "confirm:no")],
      ]),
    );
    return ctx.wizard.next();
  },

  // Step 4 — handle Yes / No confirmation
  async (ctx) => {
    const cbq = ctx.callbackQuery;
    if (!cbq || !("data" in cbq)) {
      await ctx.reply("Please use the Yes / No buttons above.");
      return;
    }
    await ctx.answerCbQuery();

    if (cbq.data === "confirm:yes") {
      const { selectedTelegramId } = ctx.wizard.state as ApproveState;
      if (!selectedTelegramId) {
        await ctx.reply("Something went wrong. Please try again.");
        return ctx.scene.leave();
      }
      const approved = await approveClient({ telegramId: selectedTelegramId });
      await ctx.reply(approved ? "Client approved." : "Client not found.");
    } else {
      await ctx.reply("Approval cancelled.");
    }

    return ctx.scene.leave();
  },
);
