import nodemailer from "nodemailer";

export async function sendEmailSummary(runId: string, summaryText: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass || !to || !from) return false;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to,
    subject: `[Gardien de données] Résumé du run ${runId}`,
    text: summaryText,
  });
  return true;
}
