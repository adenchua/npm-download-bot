import { Scenes, Markup } from "telegraf";
import { format } from "date-fns";

import { approveClient, getClientByTelegramId, getPendingClients, ClientDocument } from "../db/clients";
import {
  BotContext,
  requireText,
  checkSecret,
  formatClientName,
  requireCallbackData,
  CALLBACK_PREFIXES,
  SECRET_PROMPT_STEP,
} from "./helpers";

export const APPROVE_SCENE_ID = "approve_client";

interface ApproveState {
  selectedTelegramId?: number;
}

function clientButtonLabel(client: ClientDocument): string {
  const handle = client.username ? ` (@${client.username})` : "";
  const date = format(client.registeredAt, "dd MMM yyyy");
  return `${formatClientName(client)}${handle} — ${date}`;
}

function clientConfirmText(client: ClientDocument): string {
  const lines = ["Approve this client?\n", `ID: ${client.telegramId}`, `Name: ${formatClientName(client)}`];
  if (client.username) lines.push(`Username: @${client.username}`);
  lines.push(`Registered: ${format(client.registeredAt, "dd MMM yyyy HH:mm")}`);
  return lines.join("\n");
}

export const approveClientScene = new Scenes.WizardScene<BotContext>(
  APPROVE_SCENE_ID,

  // Step 1 — prompt for secret
  SECRET_PROMPT_STEP,

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
      Markup.button.callback(clientButtonLabel(client), `${CALLBACK_PREFIXES.SELECT_CLIENT}${client.telegramId}`),
    ]);
    await ctx.reply("Select a client to approve:", Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },

  // Step 3 — handle client selection
  async (ctx) => {
    const data = await requireCallbackData(ctx, CALLBACK_PREFIXES.SELECT_CLIENT, "Please select a client from the list above.");
    if (data === null) return;

    const telegramId = parseInt(data, 10);
    const client = await getClientByTelegramId(telegramId);
    if (!client) {
      await ctx.reply("Client not found.");
      return ctx.scene.leave();
    }

    (ctx.wizard.state as ApproveState).selectedTelegramId = telegramId;

    await ctx.reply(
      clientConfirmText(client),
      Markup.inlineKeyboard([
        [
          Markup.button.callback("Yes", `${CALLBACK_PREFIXES.CONFIRM_ACTION}yes`),
          Markup.button.callback("No", `${CALLBACK_PREFIXES.CONFIRM_ACTION}no`),
        ],
      ]),
    );
    return ctx.wizard.next();
  },

  // Step 4 — handle Yes / No confirmation
  async (ctx) => {
    const confirmation = await requireCallbackData(ctx, CALLBACK_PREFIXES.CONFIRM_ACTION, "Please use the Yes / No buttons above.");
    if (confirmation === null) return;

    if (confirmation === "yes") {
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
