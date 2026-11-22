import crypto from "node:crypto";
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

export interface SpaceAlertSettings {
  alertEmail: string;
  notifyOnEveryRun: boolean;
  webhookSecret: string;
}

const emailOutbox: RunEmailSummary[] = [];
const spaceAlertSettings = new Map<
  string,
  { customAlertEmail?: string; notifyOnEveryRun: boolean; webhookSecret: string }
>();

function spaceKey(ctx: Pick<TenantSpaceContext, "tenantId" | "spaceId">): string {
  return `${ctx.tenantId}::${ctx.spaceId}`;
}

function getOrCreateRecord(ctx: Pick<TenantSpaceContext, "tenantId" | "spaceId">) {
  const key = spaceKey(ctx);
  let rec = spaceAlertSettings.get(key);
  if (!rec) {
    rec = {
      notifyOnEveryRun: true,
      webhookSecret: crypto
        .createHmac("sha256", "misaina-webhook-seed")
        .update(key)
        .digest("hex")
        .slice(0, 24),
    };
    spaceAlertSettings.set(key, rec);
  }
  return rec;
}

export function getSpaceAlertSettings(
  ctx: Pick<TenantSpaceContext, "tenantId" | "spaceId">
): SpaceAlertSettings {
  const rec = getOrCreateRecord(ctx);
  return {
    alertEmail:
      rec.customAlertEmail || process.env.ALERT_EMAIL_TO?.trim() || "equipe-meal@misaina-corp.org",
    notifyOnEveryRun: rec.notifyOnEveryRun,
    webhookSecret: rec.webhookSecret,
  };
}

export function updateSpaceAlertSettings(
  ctx: Pick<TenantSpaceContext, "tenantId" | "spaceId">,
  patch: Partial<Pick<SpaceAlertSettings, "alertEmail" | "notifyOnEveryRun">>
): SpaceAlertSettings {
  const rec = getOrCreateRecord(ctx);
  if (typeof patch.alertEmail === "string" && patch.alertEmail.trim()) {
    rec.customAlertEmail = patch.alertEmail.trim();
  }
  if (typeof patch.notifyOnEveryRun === "boolean") {
    rec.notifyOnEveryRun = patch.notifyOnEveryRun;
  }
  return getSpaceAlertSettings(ctx);
}

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
  const rec = getOrCreateRecord(ctx);
  const settings = getSpaceAlertSettings(ctx);
  const channels = ["ui_preview", "agent_actions"];
  let emailSent = false;
  let emailProvider: "resend" | "smtp" | undefined;
  let recipient: string | undefined;

  if (settings.notifyOnEveryRun) {
    try {
      const emailRes = await sendEmailSummary(runId, summaryText, rec.customAlertEmail);
      if (emailRes.sent) {
        emailSent = true;
        emailProvider = emailRes.provider;
        recipient = emailRes.recipient;
        channels.push("email");
      }
    } catch (err) {
      console.warn("Notification Email échouée:", err);
    }
  }

  emailOutbox.unshift({
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    subject: `[MISAINA Gardien de données] Résumé du run ${runId}`,
    recipient: recipient || settings.alertEmail,
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
