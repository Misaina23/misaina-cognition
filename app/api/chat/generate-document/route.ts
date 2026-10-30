import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb, GeneratedDocRecord } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const { question, answer, sources } = await req.json();
    const user = getAuthUser(req) || mockDb.users[0];
    const id = `gen-${Date.now()}`;
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
    const fileName = `Misaina_Cognition_${timestamp}.docx`;

    const sourcesText = (sources || [])
      .map((s: any) => `- ${s.documentTitle} (Page ${s.pageNumber || 1})\n  Extrait: "${s.excerpt || ""}"`)
      .join("\n");

    const content = `MISAINA COGNITION — RAPPORT DE SYNTHÈSE
Généré le : ${new Date().toLocaleString("fr-FR")}
Utilisateur : ${user.fullName} (${user.department})

============================================================
QUESTION INITIALE :
${question}

============================================================
RÉPONSE VALIDÉE :
${answer}

============================================================
SOURCES & RÉFÉRENCES CÉDÉES :
${sourcesText || "Aucune source externe."}
`;

    const doc: GeneratedDocRecord = {
      id,
      userId: user.id,
      question,
      answer,
      sources: sources || [],
      fileName,
      size: Buffer.byteLength(content, "utf-8"),
      content,
      createdAt: new Date().toISOString(),
    };

    mockDb.generatedDocs.push(doc);

    return NextResponse.json({
      id: doc.id,
      fileName: doc.fileName,
      size: doc.size,
      createdAt: doc.createdAt,
    });
  } catch (error) {
    return NextResponse.json({ message: "Erreur lors de la génération du document" }, { status: 500 });
  }
}
