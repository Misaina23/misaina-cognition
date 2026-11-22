import type { TenantSpaceContext } from "../connectors/types";
import { journalRepo } from "../journal";
import { sendEmailSummary } from "./email";

export interface NotificationResult {
  channels: string[];
  emailSent: boolean;
  emailProvider?: "resend" | "smtp";
  recipient?: string;
}

export interface RunEmailSummary {
  id: string;
  tenantId: string;
  spaceId: string;
  runId: string;
  subject: string;
  recipient: string;
  channels: string[];
  emailSent: boolean;
  emailProvider?: "resend" | "smtp";
  summaryText: string;
  sentAt: string;
}

const emailOutbox: RunEmailSummary[] = [];

export function listRunEmailSummaries(ctx: TenantSpaceContext): RunEmailSummary[] {
  return emailOutbox.filter(
    (e) => e.tenantId === ctx.tenantId && e.spaceId === ctx.spaceId
  );
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

  emailOutbox.unshift({
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    subject: `[MISAINA Gardien de données] Résumé du run ${runId}`,
    recipient: recipient || process.env.ALERT_EMAIL_TO?.trim() || "equipe-meal@misaina-corp.org",
    channels: [...channels],
    emailSent,
    emailProvider,
    summaryText,
    sentAt: new Date().toISOString(),
  });
  if (emailOutbox.length > 100) emailOutbox.length = 100;

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
