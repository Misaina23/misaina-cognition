import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createGuardianServer } from "../src/server";

async function main() {
  const server = createGuardianServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Accès refusé sans session signée (401)
    const noAuth = await fetch(`${baseUrl}/api/spaces`);
    assert.equal(noAuth.status, 401);

    // 2. En-tête X-User-Id seul refusé (401)
    const headerOnly = await fetch(`${baseUrl}/api/spaces`, {
      headers: { "X-User-Id": "u-1" },
    });
    assert.equal(headerOnly.status, 401);

    // 3. Jeton JWT forgé / altéré refusé (401)
    const forgedJwt = await fetch(`${baseUrl}/api/spaces`, {
      headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEifQ.invalide" },
    });
    assert.equal(forgedJwt.status, 401);

    // 4. Connexion avec mauvais mot de passe refusée (401)
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dir.exec@misaina-corp.org", password: "mauvais-mot-de-passe" }),
    });
    assert.equal(badLogin.status, 401);

    // 5. Connexion valide u-1 -> cookie HttpOnly + JWT
    const loginU1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dir.exec@misaina-corp.org", password: "DirExec2026!" }),
    });
    assert.equal(loginU1.status, 200);
    const setCookie = loginU1.headers.get("set-cookie") || "";
    assert.ok(setCookie.includes("gardien_session="));
    assert.ok(setCookie.includes("HttpOnly"));
    const cookiePair = setCookie.split(";")[0];

    const spacesRes = await fetch(`${baseUrl}/api/spaces`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(spacesRes.status, 200);
    const spacesBody = (await spacesRes.json()) as { spaces: Array<{ id: string }> };
    assert.ok(spacesBody.spaces.some((s) => s.id === "space-u1-global"));

    // 6. Isolation inter-tenant : u-3 connecté ne peut pas lire space-u1-global (403)
    const loginU3 = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a.traore@misaina-corp.org", password: "SahelOps2026!" }),
    });
    assert.equal(loginU3.status, 200);
    const u3Json = (await loginU3.json()) as { token: string };

    const crossTenant = await fetch(`${baseUrl}/api/runs?spaceId=space-u1-global`, {
      headers: { Authorization: `Bearer ${u3Json.token}` },
    });
    assert.equal(crossTenant.status, 403);

    // 7. Téléchargement du rapport hebdomadaire .docx (signature ZIP "PK")
    const docxRes = await fetch(`${baseUrl}/api/reports/weekly?spaceId=space-u1-global`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(docxRes.status, 200);
    const docxBuf = Buffer.from(await docxRes.arrayBuffer());
    assert.ok(docxBuf.length > 500);
    assert.equal(docxBuf.subarray(0, 2).toString("utf8"), "PK");

    console.log(
      "[backend/tests/auth.test.ts] Auth JWT/Cookie 401/403, login et export .docx validés."
    );
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
