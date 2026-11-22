import nodemailer from "nodemailer";
import { mockDb } from "../server/mockDb";
import { guardianRepo } from "./repository";
import type { TenantSpaceContext } from "./types";

export interface NotificationResult {
  channels: string[];
  telegramSent: boolean;
  emailSent: boolean;
  errors: string[];
}

/**
 * Envoie le résumé de fin de run selon l'ordre imposé :
 * 1. Fallback garanti : journalisation dans agent_actions + événement UI (SSE)
 * 2. Telegram Bot réel si TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID sont définis
 * 3. Email SMTP réel via nodemailer si SMTP_HOST / SMTP_USER / SMTP_PASS / ALERT_EMAIL_TO sont définis
 */
export async function dispatchRunSummaryNotification(
  ctx: TenantSpaceContext,
  runId: string,
  summaryText: string
): Promise<NotificationResult> {
  const channels: string[] = ["ui_preview", "agent_actions"];
  const errors: string[] = [];
  let telegramSent = false;
  let emailSent = false;

  // 1. Diffusion SSE vers l'interface utilisateur (fallback garanti)
  mockDb.broadcastEvent({
    type: "guardian_summary",
    documentId: runId,
    percent: 100,
    message: summaryText,
  });

  // 2. Telegram Bot réel (uniquement si variables présentes)
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHAT_ID;
  if (tgToken && tgChatId) {
    try {
      const url = `https://api.telegram.org/bot${tgToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChatId,
          text: `Misaina Gardien de données — Run ${runId}\n\n${summaryText}`,
        }),
      });
      if (res.ok) {
        telegramSent = true;
        channels.push("telegram");
      } else {
        errors.push(`Telegram HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`Telegram: ${err instanceof Error ? err.message : "erreur réseau"}`);
    }
  }

  // 3. Email SMTP réel via nodemailer (uniquement si variables présentes)
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const alertTo = process.env.ALERT_EMAIL_TO;
  if (smtpHost && smtpUser && smtpPass && alertTo) {
    try {
      const port = Number(process.env.SMTP_PORT || "587");
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: alertTo,
        subject: `[Misaina Gardien] Résumé du run ${runId}`,
        text: summaryText,
      });
      emailSent = true;
      channels.push("smtp_email");
    } catch (err) {
      errors.push(`SMTP: ${err instanceof Error ? err.message : "erreur envoi"}`);
    }
  }

  // Journalise la notification dans agent_actions (scopée par tenantId + spaceId)
  guardianRepo.addAgentAction(ctx, {
    id: `act-notif-${Date.now()}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "notify_run_summary",
    inputs: { runId },
    output: { channels, telegramSent, emailSent, errors },
    decision: `Résumé diffusé (${channels.join(", ")})`,
    confidence: 1,
    author: "agent",
    reversible: false,
    reverted: false,
  });

  return { channels, telegramSent, emailSent, errors };
}
