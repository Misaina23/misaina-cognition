import type { TenantSpaceContext } from "../connectors/types";
import { journalRepo } from "../journal";
import { sendEmailSummary } from "./email";

export interface NotificationResult {
  channels: string[];
  emailSent: boolean;
  emailProvider?: "resend" | "smtp";
  recipient?: string;
}

/**
 * Diffuse le résumé de fin de run par Email (Resend prioritaire, repli SMTP Gmail/nodemailer)
 * en plus de la journalisation dans agent_actions et de l'aperçu UI.
 */
export async function dispatchRunSummaryNotification(
  ctx: TenantSpaceContext,
  runId: string,
  summaryText: string
): Promise<NotificationResult> {
  const channels = ["ui_preview", "agent_actions"];
  let emailSent = false;
  let emailProvider: "resend" | "smtp" | undefined;
  let recipient: string | undefined;

  try {
    const emailRes = await sendEmailSummary(runId, summaryText);
    if (emailRes.sent) {
      emailSent = true;
      emailProvider = emailRes.provider;
      recipient = emailRes.recipient;
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
    output: {
      channels,
      emailSent,
      emailProvider: emailProvider ?? null,
      recipient: recipient ?? null,
      summaryPreview: summaryText,
    },
    decision: `Résumé diffusé (${channels.join(", ")})`,
    confidence: 1,
    author: "agent",
    reversible: false,
    reverted: false,
  });

  return { channels, emailSent, emailProvider, recipient };
}
