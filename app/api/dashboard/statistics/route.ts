import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  const totalDocuments = mockDb.documents.length;
  const totalUsers = mockDb.users.length;
  const totalQuestions = mockDb.conversations.reduce(
    (sum, c) => sum + c.messages.filter((m) => m.role === "user").length,
    18 // default base questions
  );

  const mostConsulted = [
    { title: "Ressources Humaines", hits: 42 },
    { title: "R&D", hits: 35 },
    { title: "Sécurité", hits: 28 },
    { title: "Organisation", hits: 19 },
    { title: "Général", hits: 14 },
  ];

  return NextResponse.json({
    totalDocuments,
    totalUsers,
    totalQuestions,
    mostConsulted,
    avgResponseTimeMs: 420,
  });
}
