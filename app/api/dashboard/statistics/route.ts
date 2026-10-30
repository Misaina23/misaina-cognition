import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  const totalDocuments = mockDb.documents.length;
  const totalUsers = mockDb.users.length;
  const totalQuestions = mockDb.conversations.reduce(
    (sum, c) => sum + c.messages.filter((m) => m.role === "user").length,
    24 // base authentic queries
  );

  const mostConsulted = [
    { title: "Normes Internationales (Sphère, CHS)", hits: 58 },
    { title: "Sécurité Terrain & SOP Évacuation", hits: 47 },
    { title: "SMSI ISO/IEC 27001 & PSSI", hits: 39 },
    { title: "Finance & Bailleurs (USAID / ECHO)", hits: 32 },
    { title: "Gouvernance RGPD & Données Sensibles", hits: 26 },
  ];

  return NextResponse.json({
    totalDocuments,
    totalUsers,
    totalQuestions,
    mostConsulted,
    avgResponseTimeMs: 385,
  });
}
