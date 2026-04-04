import { Scenes, Markup } from "telegraf";
import { format } from "date-fns";

import { getPendingJobs, updateJobStatus, getJobByJobId, JobDocument } from "../db/jobs";
import { getClientById, ClientDocument } from "../db/clients";
import { BotContext, requireText, checkSecret } from "./helpers";

export const NOTIFY_CLIENT_SCENE_ID = "notify_client";

interface NotifyState {
  selectedJobId?: string;
}

function jobButtonLabel(job: JobDocument, client: ClientDocument): string {
  const nameParts = [client.firstName, client.lastName].filter(Boolean);
  const fullName = nameParts.join(" ");
  const handle = client.username ? ` (@${client.username})` : "";
  const date = format(job.startedAt, "dd MMM yyyy HH:mm");
  return `${job.jobId} — ${fullName}${handle} [${date}]`;
}

export const notifyClientScene = new Scenes.WizardScene<BotContext>(
  NOTIFY_CLIENT_SCENE_ID,

  // Step 1 — prompt for secret
  async (ctx) => {
    await ctx.reply("Enter the admin secret:");
    return ctx.wizard.next();
  },

  // Step 2 — validate secret, show last 5 pending jobs
  async (ctx) => {
    const text = await requireText(ctx);
    if (text === null) return;
    if (!(await checkSecret(ctx, text))) return;

    const pendingJobs = await getPendingJobs(5);
    if (pendingJobs.length === 0) {
      await ctx.reply("No pending jobs.");
      return ctx.scene.leave();
    }

    const clientResults = await Promise.all(pendingJobs.map((job) => getClientById(job.clientId)));

    const jobsWithClients = pendingJobs
      .map((job, index) => ({ job, client: clientResults[index] }))
      .filter((entry): entry is { job: JobDocument; client: ClientDocument } => entry.client !== null);

    if (jobsWithClients.length === 0) {
      await ctx.reply("No pending jobs with resolvable clients.");
      return ctx.scene.leave();
    }

    const buttons = jobsWithClients.map(({ job, client }) => [
      Markup.button.callback(jobButtonLabel(job, client), `job:${job.jobId}`),
    ]);

    await ctx.reply("Select a job to update:", Markup.inlineKeyboard(buttons));
    return ctx.wizard.next();
  },

  // Step 3 — handle job selection, show Success / Failed buttons
  async (ctx) => {
    const cbq = ctx.callbackQuery;
    if (!cbq || !("data" in cbq) || !cbq.data.startsWith("job:")) {
      await ctx.reply("Please select a job from the list above.");
      return;
    }
    await ctx.answerCbQuery();

    const selectedJobId = cbq.data.slice("job:".length);
    (ctx.wizard.state as NotifyState).selectedJobId = selectedJobId;

    await ctx.reply(`Selected job: \`${selectedJobId}\`\n\nWhat was the outcome?`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Success", "outcome:success"), Markup.button.callback("Failed", "outcome:failed")],
      ]),
    });
    return ctx.wizard.next();
  },

  // Step 4 — handle outcome, update DB, notify client
  async (ctx) => {
    const cbq = ctx.callbackQuery;
    if (!cbq || !("data" in cbq) || !cbq.data.startsWith("outcome:")) {
      await ctx.reply("Please use the Success / Failed buttons above.");
      return;
    }
    await ctx.answerCbQuery();

    const { selectedJobId } = ctx.wizard.state as NotifyState;
    if (!selectedJobId) {
      await ctx.reply("Something went wrong. Please try again.");
      return ctx.scene.leave();
    }

    const outcomeRaw = cbq.data.slice("outcome:".length);
    const status = outcomeRaw === "success" ? "success" : "failed";

    const updated = await updateJobStatus(selectedJobId, status, ctx.from!.id);
    if (!updated) {
      await ctx.reply("Job not found.");
      return ctx.scene.leave();
    }

    const job = await getJobByJobId(selectedJobId);
    if (!job) {
      await ctx.reply("Job updated but could not be re-fetched — no notification sent.");
      return ctx.scene.leave();
    }

    const client = await getClientById(job.clientId);
    if (!client) {
      await ctx.reply("Job updated but client could not be found — no notification sent.");
      return ctx.scene.leave();
    }

    const clientMessage =
      status === "success"
        ? `Your download job \`${selectedJobId}\` has completed successfully. ✓`
        : `Your download job \`${selectedJobId}\` failed to complete. Please submit a new request or contact an admin.`;

    try {
      await ctx.telegram.sendMessage(client.telegramId, clientMessage, { parse_mode: "Markdown" });
    } catch (err) {
      console.error(`Failed to notify client ${client.telegramId}:`, err);
      await ctx.reply(
        `Job \`${selectedJobId}\` marked as ${status}, but the client notification could not be delivered.`,
        { parse_mode: "Markdown" },
      );
      return ctx.scene.leave();
    }

    await ctx.reply(`Job \`${selectedJobId}\` marked as ${status}. Client notified.`, { parse_mode: "Markdown" });
    return ctx.scene.leave();
  },
);
