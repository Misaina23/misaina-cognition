import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createGuardianServer } from "../src/server";

async function main() {
  const server = createGuardianServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1. Connexion du Super Admin SAINA (andrianisaina23@gmail.com)
    const sainaLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "andrianisaina23@gmail.com",
        password: ["1234", "saina"].join(""),
      }),
    });
    assert.equal(sainaLogin.status, 200, "Super Admin SAINA doit pouvoir se connecter");
    const sainaJson = (await sainaLogin.json()) as {
      token: string;
      user: { id: string; fullName: string; role: string; permissions: string[] };
      spaces: Array<{ id: string }>;
    };
    assert.equal(sainaJson.user.fullName, "SAINA");
    assert.equal(sainaJson.user.role, "SUPER_ADMIN");
    assert.ok(sainaJson.user.permissions.includes("users:manage"));
    assert.ok(
      sainaJson.spaces.some((s) => s.id === "space-u1-global") &&
        sainaJson.spaces.some((s) => s.id === "space-u3-sahel"),
      "SUPER_ADMIN doit voir les espaces de tous les tenants"
    );

    // 2. Inscription publique -> statut pending obligatoire, aucun jeton délivré
    const uniqueEmail = `test.pending.${Date.now()}@ong-test.org`;
    const tempPass = "ValidationTest2026!";
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Nadia Razafy",
        email: uniqueEmail,
        password: tempPass,
        department: "Direction Exécutive & Conseil",
        requestedRole: "ANALYSTE",
      }),
    });
    assert.equal(registerRes.status, 201);
    const registerBody = (await registerRes.json()) as {
      registered: boolean;
      status: string;
      user: { id: string; status: string };
    };
    assert.equal(registerBody.registered, true);
    assert.equal(registerBody.status, "pending");
    assert.equal(registerRes.headers.get("set-cookie"), null);
    const pendingUserId = registerBody.user.id;

    // 3. Connexion refusée (403) tant que le compte est pending
    const pendingLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail, password: tempPass }),
    });
    assert.equal(pendingLogin.status, 403, "Compte en attente ne doit pas pouvoir se connecter");

    // 4. Utilisateur sans droit users:manage (u-3) refusé (403) sur /api/users
    const u3Login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a.traore@misaina-corp.org", password: "SahelOps2026!" }),
    });
    assert.equal(u3Login.status, 200);
    const u3Json = (await u3Login.json()) as { token: string };

    const forbiddenUsersGet = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${u3Json.token}` },
    });
    assert.equal(forbiddenUsersGet.status, 403);

    const forbiddenApprove = await fetch(`${baseUrl}/api/users/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u3Json.token}`,
      },
      body: JSON.stringify({ userId: pendingUserId, decision: "approve", role: "LECTEUR" }),
    });
    assert.equal(forbiddenApprove.status, 403);

    // 5. Super Admin SAINA liste les utilisateurs puis approuve avec le rôle LECTEUR
    const adminListRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Authorization: `Bearer ${sainaJson.token}` },
    });
    assert.equal(adminListRes.status, 200);
    const adminListJson = (await adminListRes.json()) as {
      users: Array<{ id: string; status: string }>;
    };
    assert.ok(adminListJson.users.some((u) => u.id === pendingUserId && u.status === "pending"));

    const approveRes = await fetch(`${baseUrl}/api/users/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sainaJson.token}`,
      },
      body: JSON.stringify({
        userId: pendingUserId,
        decision: "approve",
        role: "LECTEUR",
        spaceIds: ["space-u1-global"],
      }),
    });
    assert.equal(approveRes.status, 200);
    const approvedUser = ((await approveRes.json()) as { user: { status: string; role: string } })
      .user;
    assert.equal(approvedUser.status, "active");
    assert.equal(approvedUser.role, "LECTEUR");

    // 6. Le compte validé (LECTEUR) peut désormais se connecter, lire /api/runs (200), mais pas exporter/lancer (403)
    const readerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail, password: tempPass }),
    });
    assert.equal(readerLogin.status, 200);
    const readerJson = (await readerLogin.json()) as { token: string };

    const readerRuns = await fetch(`${baseUrl}/api/runs?spaceId=space-u1-global`, {
      headers: { Authorization: `Bearer ${readerJson.token}` },
    });
    assert.equal(readerRuns.status, 200);

    const readerExportCsv = await fetch(`${baseUrl}/api/records/export?spaceId=space-u1-global`, {
      headers: { Authorization: `Bearer ${readerJson.token}` },
    });
    assert.equal(readerExportCsv.status, 403);

    const readerDocx = await fetch(`${baseUrl}/api/reports/weekly?spaceId=space-u1-global`, {
      headers: { Authorization: `Bearer ${readerJson.token}` },
    });
    assert.equal(readerDocx.status, 403);

    const readerRunAgent = await fetch(`${baseUrl}/api/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${readerJson.token}`,
      },
      body: JSON.stringify({ spaceId: "space-u1-global", mode: "agent" }),
    });
    assert.equal(readerRunAgent.status, 403);

    // 7. Super Admin SAINA accorde meal:export -> export CSV autorisé (200)
    const grantExportRes = await fetch(`${baseUrl}/api/users/permissions`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sainaJson.token}`,
      },
      body: JSON.stringify({
        userId: pendingUserId,
        permissions: ["meal:read", "knowledge:read", "meal:export"],
      }),
    });
    assert.equal(grantExportRes.status, 200);

    const readerExportAfter = await fetch(
      `${baseUrl}/api/records/export?spaceId=space-u1-global`,
      { headers: { Authorization: `Bearer ${readerJson.token}` } }
    );
    assert.equal(readerExportAfter.status, 200);

    // 8. Suspension du compte -> JWT existant rejeté (401) et nouvelle connexion refusée (403)
    const suspendRes = await fetch(`${baseUrl}/api/users/permissions`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sainaJson.token}`,
      },
      body: JSON.stringify({ userId: pendingUserId, status: "suspended" }),
    });
    assert.equal(suspendRes.status, 200);

    const suspendedApiCall = await fetch(`${baseUrl}/api/runs?spaceId=space-u1-global`, {
      headers: { Authorization: `Bearer ${readerJson.token}` },
    });
    assert.equal(suspendedApiCall.status, 401);

    const suspendedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: uniqueEmail, password: tempPass }),
    });
    assert.equal(suspendedLogin.status, 403);

    // 9. Refus d'une inscription -> statut rejected et connexion bloquée (403)
    const rejectedEmail = `rejected.${Date.now()}@ong-test.org`;
    const reg2Res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Compte Refusé",
        email: rejectedEmail,
        password: tempPass,
        department: "Direction Exécutive & Conseil",
      }),
    });
    assert.equal(reg2Res.status, 201);
    const reg2Body = (await reg2Res.json()) as { user: { id: string } };

    const rejectRes = await fetch(`${baseUrl}/api/users/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sainaJson.token}`,
      },
      body: JSON.stringify({ userId: reg2Body.user.id, decision: "reject" }),
    });
    assert.equal(rejectRes.status, 200);

    const rejectedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: rejectedEmail, password: tempPass }),
    });
    assert.equal(rejectedLogin.status, 403);

    console.log(
      "[backend/tests/users_rbac.test.ts] Super Admin SAINA, validation obligatoire (pending->active/rejected) et RBAC granulaire validés."
    );
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
