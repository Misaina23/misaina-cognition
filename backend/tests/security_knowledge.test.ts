import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { knowledgeEngine } from "../src/rag/engine";
import { SlidingWindowRateLimiter, validateExternalEndpointUrl } from "../src/security";
import { createGuardianServer } from "../src/server";

async function main() {
  // 1. Validation SSRF des URL de connecteurs externes
  assert.doesNotThrow(() => validateExternalEndpointUrl("https://kf.kobotoolbox.org/api/v2/assets"));
  assert.throws(() => validateExternalEndpointUrl("http://127.0.0.1:4000/secret"));
  assert.throws(() => validateExternalEndpointUrl("http://localhost:8080/internal"));
  assert.throws(() => validateExternalEndpointUrl("http://169.254.169.254/latest/meta-data"));
  assert.throws(() => validateExternalEndpointUrl("http://192.168.1.10/api"));
  assert.throws(() => validateExternalEndpointUrl("http://10.0.0.5/data"));
  assert.throws(() => validateExternalEndpointUrl("ftp://files.example.org/data.csv"));

  // 2. Test unitaire du limiteur de débit à fenêtre glissante
  const limiter = new SlidingWindowRateLimiter();
  assert.equal(limiter.consume("k1", 2, 10_000).allowed, true);
  assert.equal(limiter.consume("k1", 2, 10_000).allowed, true);
  const blocked = limiter.consume("k1", 2, 10_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);

  const server = createGuardianServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 3. /api/health enrichi et en-têtes de sécurité
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get("x-content-type-options"), "nosniff");
    const healthBody = (await healthRes.json()) as {
      status: string;
      uptimeSec?: number;
      timestamp?: string;
    };
    assert.equal(healthBody.status, "ok");
    assert.equal(typeof healthBody.uptimeSec, "number");
    assert.ok(Boolean(healthBody.timestamp));

    // 4. Route publique leads Grands Comptes + contrôle RBAC en lecture
    const leadRes = await fetch(`${baseUrl}/api/contact/enterprise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.77",
      },
      body: JSON.stringify({
        organization: "ONG Horizon Solidarité",
        contactName: "Claire Rakoto",
        email: "c.rakoto@horizon-solidarite.org",
        employeeCount: "250 - 1000",
        deploymentMode: "SecNumCloud",
        message: "Demande d'audit technique et déploiement souverain multi-espaces.",
      }),
    });
    assert.equal(leadRes.status, 201);
    const leadJson = (await leadRes.json()) as { ticketId: string; status: string };
    assert.ok(leadJson.ticketId.startsWith("LEAD-"));

    // Lecture sans authentification -> 401
    const unauthLeads = await fetch(`${baseUrl}/api/contact/enterprise`);
    assert.equal(unauthLeads.status, 401);

    // Connexion non-admin (u-3) -> 403 sur GET /api/contact/enterprise
    const loginU3 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a.traore@misaina-corp.org", password: "SahelOps2026!" }),
    });
    assert.equal(loginU3.status, 200);
    const u3Token = ((await loginU3.json()) as { token: string }).token;

    const u3Leads = await fetch(`${baseUrl}/api/contact/enterprise`, {
      headers: { Authorization: `Bearer ${u3Token}` },
    });
    assert.equal(u3Leads.status, 403);

    // Connexion admin (u-1) -> 200 sur GET /api/contact/enterprise
    const loginU1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dir.exec@misaina-corp.org", password: "DirExec2026!" }),
    });
    assert.equal(loginU1.status, 200);
    const u1Token = ((await loginU1.json()) as { token: string }).token;

    const adminLeads = await fetch(`${baseUrl}/api/contact/enterprise`, {
      headers: { Authorization: `Bearer ${u1Token}` },
    });
    assert.equal(adminLeads.status, 200);
    const adminLeadsBody = (await adminLeads.json()) as { leads: Array<{ id: string }> };
    assert.ok(adminLeadsBody.leads.some((l) => l.id === leadJson.ticketId));

    // 5. Rejet SSRF au moment de l'enregistrement d'une source
    const ssrfSource = await fetch(`${baseUrl}/api/sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Token}`,
      },
      body: JSON.stringify({
        spaceId: "space-u1-global",
        name: "Source SSRF Interne",
        type: "generic",
        format: "json",
        endpointUrl: "http://169.254.169.254/latest/meta-data",
      }),
    });
    assert.equal(ssrfSource.status, 400);

    // 6. Vérification d'intégrité de la chaîne d'audit SHA-256 (intègre puis altérée)
    const ragRes = await fetch(`${baseUrl}/api/knowledge/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Token}`,
      },
      body: JSON.stringify({
        spaceId: "space-u1-global",
        question: "Quelle est la politique de rétention et conformité SecNumCloud ?",
      }),
    });
    assert.equal(ragRes.status, 200);
    const ragBody = (await ragRes.json()) as {
      citations: Array<{ bm25Score: number }>;
      confidence: number;
    };
    assert.ok(ragBody.citations.length > 0);
    assert.ok(ragBody.citations.every((citation) => citation.bm25Score > 0));
    assert.ok(ragBody.confidence > 0);

    const unmatchedRagRes = await fetch(`${baseUrl}/api/knowledge/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ["Bearer", u1Token].join(" "),
      },
      body: JSON.stringify({
        spaceId: "space-u1-global",
        question: "xylophone astrophysics quantum entanglement",
      }),
    });
    assert.equal(unmatchedRagRes.status, 200);
    const unmatchedRagBody = (await unmatchedRagRes.json()) as {
      citations: unknown[];
      confidence: number;
      answer: string;
    };
    assert.equal(unmatchedRagBody.citations.length, 0);
    assert.equal(unmatchedRagBody.confidence, 0);
    assert.match(unmatchedRagBody.answer, /Aucun document autorisé/);

    const verifyOk = await fetch(`${baseUrl}/api/knowledge/verify-audit-chain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Token}`,
      },
      body: JSON.stringify({ spaceId: "space-u1-global" }),
    });
    assert.equal(verifyOk.status, 200);
    const verifyOkBody = (await verifyOk.json()) as { intact: boolean; totalEntries: number };
    assert.equal(verifyOkBody.intact, true);
    assert.ok(verifyOkBody.totalEntries >= 2);

    // Simulation d'altération d'une entrée dans le registre en mémoire
    const auditEntries = knowledgeEngine.listAudit({
      tenantId: "tenant-direction-executive-conseil",
      spaceId: "space-u1-global",
      userId: "u-1",
    });
    assert.ok(auditEntries.length >= 2);
    const originalHash = auditEntries[0].eventHash;
    auditEntries[0].eventHash = "tampered_hash_00000000000000000000";
    const tamperedResult = knowledgeEngine.verifyAuditChain({
      tenantId: "tenant-direction-executive-conseil",
      spaceId: "space-u1-global",
      userId: "u-1",
    });
    assert.equal(tamperedResult.intact, false);
    assert.ok(Boolean(tamperedResult.brokenAtId));
    auditEntries[0].eventHash = originalHash;

    // 7. Limitation de débit HTTP 429 sur /api/contact/enterprise après 10 requêtes (IP isolée)
    for (let i = 0; i < 9; i++) {
      const ok = await fetch(`${baseUrl}/api/contact/enterprise`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.77",
        },
        body: JSON.stringify({
          organization: `Org ${i}`,
          contactName: "Testeur Charge",
          email: `test${i}@example.org`,
          employeeCount: "50 - 250",
          deploymentMode: "On-Premise",
          message: "Test limitation de débit publique.",
        }),
      });
      assert.equal(ok.status, 201);
    }
    const rateLimited = await fetch(`${baseUrl}/api/contact/enterprise`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "198.51.100.77",
      },
      body: JSON.stringify({
        organization: "Org 11",
        contactName: "Testeur Charge",
        email: "overflow@example.org",
        employeeCount: "50 - 250",
        deploymentMode: "On-Premise",
        message: "Doit recevoir HTTP 429.",
      }),
    });
    assert.equal(rateLimited.status, 429);
    assert.ok(Number(rateLimited.headers.get("retry-after")) >= 1);

    console.log(
      "[backend/tests/security_knowledge.test.ts] SSRF, Rate-Limit 429, Audit SHA-256 chain & Enterprise Leads RBAC validés."
    );
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
