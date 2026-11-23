import assert from "node:assert/strict";
import http from "node:http";
import { journalRepo } from "../src/journal";
import { dispatchRunSummaryNotification } from "../src/notify";
import { sendEmailSummary } from "../src/notify/email";
import { createGuardianServer } from "../src/server";
import { getPrincipalByIdOrHeader, resolveContextForUser } from "../src/tenant";

async function testResendAndDevRedirect() {
  const prevEnv = { ...process.env };
  const origFetch = globalThis.fetch;
  const captured: Array<{ url: string; headers: Record<string, string>; body: Record<string, unknown> }> = [];

  try {
    process.env.RESEND_API_KEY = "re_test_dummy_key";
    process.env.RESEND_FROM_EMAIL = "onboarding@resend.dev";
    process.env.RESEND_FROM_NAME = "MISAINA";
    process.env.ALERT_EMAIL_TO = "prod-alert@example.org";
    process.env.DEV_EMAIL_MODE = "true";
    process.env.DEV_REDIRECT_TO = "dev-redirect@example.org";
    delete process.env.MAIL_USERNAME;
    delete process.env.MAIL_PASSWORD;
    delete process.env.SMTP_HOST;

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      captured.push({
        url,
        headers: (init?.headers as Record<string, string>) || {},
        body,
      });
      return new Response(JSON.stringify({ id: "email_test_1" }), { status: 200 });
    }) as typeof fetch;

    const user = getPrincipalByIdOrHeader("u-1");
    const ctx = resolveContextForUser(user);
    const notif = await dispatchRunSummaryNotification(ctx, "run-email-test-1", "Synthèse test email.");

    assert.equal(notif.emailSent, true);
    assert.equal(notif.emailProvider, "resend");
    assert.equal(notif.recipient, "dev-redirect@example.org");
    assert.ok(notif.channels.includes("email"));
    assert.ok(!notif.channels.includes("telegram"), "Le canal Telegram ne doit plus exister");

    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://api.resend.com/emails");
    assert.equal(captured[0].body.from, "MISAINA <onboarding@resend.dev>");
    assert.deepEqual(captured[0].body.to, ["dev-redirect@example.org"]);

    const actions = journalRepo.listAgentActions(ctx, "run-email-test-1");
    const notifAction = actions.find((a) => a.toolName === "notify_run_summary");
    assert.ok(notifAction);
    assert.equal(notifAction.output.emailProvider, "resend");
    assert.equal(notifAction.output.recipient, "dev-redirect@example.org");

    // Vérifie repli propre si Resend échoue et aucun SMTP n'est configuré
    process.env.DEV_EMAIL_MODE = "false";
    globalThis.fetch = (async () => new Response("rate limited", { status: 429 })) as typeof fetch;
    const failedRes = await sendEmailSummary("run-email-test-2", "Synthèse fallback");
    assert.equal(failedRes.sent, false);
  } finally {
    globalThis.fetch = origFetch;
    process.env = prevEnv;
  }
}

async function testCorsTrailingSlashNormalization() {
  const prevCors = process.env.CORS_ORIGIN;
  const prevFrontend = process.env.FRONTEND_URL;
  process.env.CORS_ORIGIN = "https://cognitionmisaina.vercel.app/";
  process.env.FRONTEND_URL = "https://cognitionmisaina.vercel.app/";

  const server = createGuardianServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const addr = server.address();
    assert.ok(addr && typeof addr === "object");
    const res = await new Promise<{ status: number; allowOrigin?: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: addr.port,
          path: "/api/health",
          method: "OPTIONS",
          headers: { Origin: "https://cognitionmisaina.vercel.app" },
        },
        (r) => {
          resolve({
            status: r.statusCode || 0,
            allowOrigin: r.headers["access-control-allow-origin"] as string | undefined,
          });
        }
      );
      req.on("error", reject);
      req.end();
    });

    assert.equal(res.status, 204);
    assert.equal(res.allowOrigin, "https://cognitionmisaina.vercel.app");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (prevCors === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = prevCors;
    if (prevFrontend === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = prevFrontend;
  }
}

async function main() {
  await testResendAndDevRedirect();
  await testCorsTrailingSlashNormalization();
  console.log("[backend/tests/notify_email.test.ts] Notifications Email (Resend/DEV_EMAIL_MODE/sans Telegram) et CORS validés.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
