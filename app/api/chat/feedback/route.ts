import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const { query, rating, comment, certified } = await req.json();
    const user = getAuthUser(req) || mockDb.users[0];

    mockDb.feedbacks.unshift({
      id: `fb-${Date.now()}`,
      query: query || "Question RAG",
      rating,
      comment,
      certified: !!certified,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      department: user.department,
      action: "SEARCH_QUERY",
      queryOrTarget: `Validation qualité RAG (${rating === "positive" ? "Conforme / Approuvé" : "Signalement imprécision"}) : ${query || ""}`,
      dlpStatus: "CONFORME",
      sourcesCount: 0,
      latencyMs: 95,
      hashSignature: `sha256-${Math.random().toString(36).substring(2, 15)}`,
    });

    return NextResponse.json({ message: "Évaluation enregistrée" });
  } catch {
    return NextResponse.json({ message: "Erreur enregistrement" }, { status: 500 });
  }
}
