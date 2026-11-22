import nodemailer from "nodemailer";

export interface EmailSendResult {
  sent: boolean;
  provider?: "resend" | "smtp";
  recipient?: string;
}

function resolveRecipient(): string | undefined {
  const devMode = String(process.env.DEV_EMAIL_MODE || "").trim().toLowerCase() === "true";
  const devRedirect = process.env.DEV_REDIRECT_TO?.trim();
  const alertTo = process.env.ALERT_EMAIL_TO?.trim();
  const contactTo = process.env.CONTACT_TO_EMAIL?.trim();
  const mailUser = process.env.MAIL_USERNAME?.trim() || process.env.SMTP_USER?.trim();

  if (devMode && devRedirect) return devRedirect;
  return alertTo || contactTo || devRedirect || mailUser || undefined;
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return false;

  const fromEmail =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "onboarding@resend.dev";
  const fromName = process.env.RESEND_FROM_NAME?.trim();
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}${body ? `: ${body}` : ""}`);
  }
  return true;
}

async function sendViaSmtp(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const user = process.env.SMTP_USER?.trim() || process.env.MAIL_USERNAME?.trim();
  const pass = process.env.SMTP_PASS?.trim() || process.env.MAIL_PASSWORD?.trim();
  const host = process.env.SMTP_HOST?.trim() || (user && pass ? "smtp.gmail.com" : undefined);
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const from =
    process.env.SMTP_FROM?.trim() ||
    user ||
    process.env.RESEND_FROM_EMAIL?.trim();

  if (!host || !user || !pass || !from) return false;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
  });
  return true;
}

export async function sendEmailSummary(
  runId: string,
  summaryText: string
): Promise<EmailSendResult> {
  const to = resolveRecipient();
  if (!to) return { sent: false };

  const subject = `[MISAINA Gardien de données] Résumé du run ${runId}`;

  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const ok = await sendViaResend({ to, subject, text: summaryText });
      if (ok) return { sent: true, provider: "resend", recipient: to };
    } catch (err) {
      console.warn("Envoi email Resend échoué, bascule vers SMTP:", err);
    }
  }

  const smtpOk = await sendViaSmtp({ to, subject, text: summaryText });
  if (smtpOk) return { sent: true, provider: "smtp", recipient: to };

  return { sent: false };
}
