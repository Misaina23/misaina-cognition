import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  return NextResponse.json(mockDb.connectors);
}

export async function POST(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    const conn = mockDb.connectors.find((c) => c.id === id);

    if (!conn) {
      return NextResponse.json({ message: "Connecteur introuvable" }, { status: 404 });
    }

    if (action === "sync") {
      conn.status = "SYNCING";
      conn.lastSync = new Date().toISOString();
      conn.documentsIndexed += Math.floor(Math.random() * 8) + 1;

      // Log in audit trail
      mockDb.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: "u-1",
        userName: "Administrateur Misaina",
        userEmail: "admin@misaina.internal",
        department: "Direction Générale",
        action: "CONNECTOR_SYNC",
        queryOrTarget: `Synchronisation manuelle : ${conn.name}`,
        dlpStatus: "CONFORME",
        sourcesCount: conn.documentsIndexed,
        latencyMs: 1240,
        hashSignature: `sha256-${Math.random().toString(36).substring(2, 15)}`,
      });

      setTimeout(() => {
        conn.status = "ACTIVE";
      }, 1500);

      return NextResponse.json({ message: "Synchronisation lancée", connector: conn });
    }

    return NextResponse.json({ message: "Action non reconnue" }, { status: 400 });
  } catch {
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
