import { NextRequest, NextResponse } from "next/server";
import { mockDb, ApiKeyRecord } from "@/lib/server/mockDb";

export async function GET() {
  return NextResponse.json(mockDb.apiKeys);
}

export async function POST(req: NextRequest) {
  try {
    const { name, scope, department, rateLimitPerMin } = await req.json();

    if (!name) {
      return NextResponse.json({ message: "Nom de clé requis" }, { status: 400 });
    }

    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const prefix = `misaina_${(name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "live")}`;
    const token = `${prefix}_${randomSuffix}${Math.random().toString(36).substring(2, 10)}`;
    const tokenMasked = `${prefix}_••••••••${randomSuffix.slice(-4)}`;

    const newKey: ApiKeyRecord = {
      id: `key-${Date.now()}`,
      name,
      prefix,
      tokenMasked,
      scope: scope || "READ_ONLY",
      department: department || "Direction Générale",
      createdAt: new Date().toISOString(),
      status: "ACTIVE",
      rateLimitPerMin: rateLimitPerMin || 120,
    };

    mockDb.apiKeys.unshift(newKey);

    // Audit log
    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: "u-1",
      userName: "Administrateur Misaina",
      userEmail: "admin@misaina.internal",
      department: "Direction Générale",
      action: "SEARCH_QUERY",
      queryOrTarget: `Génération de clé d'API d'intégration : ${name}`,
      dlpStatus: "CONFORME",
      sourcesCount: 0,
      latencyMs: 140,
      hashSignature: `sha256-${Math.random().toString(36).substring(2, 15)}`,
    });

    return NextResponse.json({
      key: newKey,
      plainToken: token, // Returned only once at creation
    });
  } catch {
    return NextResponse.json({ message: "Erreur création clé" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    const key = mockDb.apiKeys.find((k) => k.id === id);
    if (key) {
      key.status = "REVOKED";
    }
    return NextResponse.json({ message: "Clé révoquée" });
  } catch {
    return NextResponse.json({ message: "Erreur révocation" }, { status: 500 });
  }
}
