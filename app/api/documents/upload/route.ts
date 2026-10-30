import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb, DocumentRecord, DocumentChunk } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "Général";
    const tags = (formData.get("tags") as string) || "";

    if (!file) {
      return NextResponse.json({ message: "Fichier requis" }, { status: 400 });
    }

    const user = getAuthUser(req) || mockDb.users[0];
    const docId = `doc-${Date.now()}`;
    const rawTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

    // Initial broadcast: parsing started
    mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 25, message: "Extraction du texte..." });

    const chunks: DocumentChunk[] = [
      {
        id: `chk-${docId}-1`,
        documentId: docId,
        pageNumber: 1,
        chunkIndex: 0,
        content: `Document d'entreprise : ${title}. Catégorie : ${category}. Ce document a été importé par ${user.fullName} (${user.department}) et validé pour indexation interne. Mots-clés : ${tags || "non spécifié"}.`,
        excerpt: `Synthèse initiale pour ${title} (Catégorie : ${category}).`,
      },
      {
        id: `chk-${docId}-2`,
        documentId: docId,
        pageNumber: 2,
        chunkIndex: 1,
        content: `Règles et dispositions associées au document ${title} : conformité avec les processus opérationnels Misaina Cognition. Indexation vectorielle calculée avec succès.`,
        excerpt: `Dispositions opérationnelles et conformité de ${title}.`,
      },
    ];

    const newDoc: DocumentRecord = {
      id: docId,
      title,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      size: file.size,
      uploadedBy: user.fullName,
      uploadedById: user.id,
      department: user.department || "General",
      version: 1,
      status: "INDEXED",
      category,
      tags,
      summary: `Document « ${title} » indexé dans la catégorie ${category}.`,
      chunks,
      createdAt: new Date().toISOString(),
    };

    mockDb.documents.unshift(newDoc);

    // Simulated progress to completion
    setTimeout(() => {
      mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 70, message: "Calcul des embeddings..." });
    }, 400);

    setTimeout(() => {
      mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 100, message: "Indexation terminée !" });
    }, 900);

    return NextResponse.json({
      id: newDoc.id,
      title: newDoc.title,
      status: "Indexé avec succès",
    });
  } catch (error) {
    return NextResponse.json({ message: "Erreur lors du téléversement" }, { status: 500 });
  }
}
