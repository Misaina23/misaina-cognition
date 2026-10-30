import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    generator: "Misaina Cognition RAG Governance Enterprise",
    version: "2.1.0",
    totalDocuments: mockDb.documents.length,
    documents: mockDb.documents,
  };

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="misaina_knowledge_base_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
