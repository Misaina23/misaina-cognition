import type { TenantSpaceContext } from "../connectors/types";
import { journalRepo } from "../journal";
import { sendEmailSummary } from "./email";
import { sendTelegramSummary } from "./telegram";

export interface NotificationResult {
  channels: string[];
  telegramSent: boolean;
  emailSent: boolean;
}

/**
 * Diffuse le résumé de fin de run dans l'ordre validé :
 * 1) Fallback journalisation dans agent_actions + aperçu UI
 * 2) Telegram Bot si TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID existent
 * 3) Email SMTP via nodemailer si configuré
 */
export async function dispatchRunSummaryNotification(
  ctx: TenantSpaceContext,
  runId: string,
  summaryText: string
): Promise<NotificationResult> {
  const channels = ["ui_preview", "agent_actions"];
  let telegramSent = false;
  let emailSent = false;

  try {
    if (await sendTelegramSummary(summaryText)) {
      telegramSent = true;
      channels.push("telegram");
    }
  } catch (err) {
    console.warn("Notification Telegram échouée:", err);
  }

  try {
    if (await sendEmailSummary(runId, summaryText)) {
      emailSent = true;
      channels.push("email");
    }
  } catch (err) {
    console.warn("Notification Email échouée:", err);
  }

  journalRepo.addAgentAction(ctx, {
    id: `act-notif-${Date.now()}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "notify_run_summary",
    inputs: { runId },
    output: { channels, telegramSent, emailSent, summaryPreview: summaryText },
    decision: `Résumé diffusé (${channels.join(", ")})`,
    confidence: 1,
    author: "agent",
    reversible: false,
    reverted: false,
  });

  return { channels, telegramSent, emailSent };
}
