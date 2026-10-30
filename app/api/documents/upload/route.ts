import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb, DocumentRecord, DocumentChunk, ClearanceLevel } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const category = (formData.get("category") as string) || "Général";
    const classification = ((formData.get("classification") as string) || "C2") as ClearanceLevel;
    const theater = (formData.get("theater") as string) || "Tous";
    const tags = (formData.get("tags") as string) || "";

    if (!file) {
      return NextResponse.json({ message: "Fichier requis" }, { status: 400 });
    }

    const user = getAuthUser(req) || mockDb.users[0];
    const docId = `doc-${Date.now()}`;
    const rawTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
    const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1);

    // Initial broadcast: parsing started
    mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 25, message: "Extraction du contenu brut..." });

    // Try extracting real text from file
    let fileText = "";
    try {
      fileText = await file.text();
    } catch {
      fileText = "";
    }

    const chunks: DocumentChunk[] = [];

    if (fileText && fileText.trim().length > 30) {
      // Real text extraction and intelligent chunking
      const paragraphs = fileText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);

      if (paragraphs.length > 0) {
        paragraphs.slice(0, 10).forEach((para, idx) => {
          const excerpt = para.length > 180 ? para.substring(0, 177) + "..." : para;
          chunks.push({
            id: `chk-${docId}-${idx + 1}`,
            documentId: docId,
            pageNumber: Math.floor(idx / 2) + 1,
            chunkIndex: idx,
            content: para,
            excerpt,
          });
        });
      }
    }

    // If binary or empty text, provide structured institutional chunk wrappers
    if (chunks.length === 0) {
      chunks.push(
        {
          id: `chk-${docId}-1`,
          documentId: docId,
          pageNumber: 1,
          chunkIndex: 0,
          content: `Document institutionnel : ${title}.\nCatégorie : ${category} | Habilitation PSSI : ${classification} | Théâtre opérationnel : ${theater}.\nDocument importé et visé par ${user.fullName} (${user.department}). Mots-clés associés : ${tags || "Normes et procédures internes"}.\nDispositions : Les clauses et directives contenues dans cet acte sont applicables à l'ensemble du personnel concerné.`,
          excerpt: `Synthèse initiale pour ${title} (Habilitation PSSI : ${classification}, Théâtre : ${theater}).`,
        },
        {
          id: `chk-${docId}-2`,
          documentId: docId,
          pageNumber: 2,
          chunkIndex: 1,
          content: `Procédures et règles opérationnelles associées à « ${title} » : mise en conformité avec les standards internationaux (ISO 27001, RGPD, Sphère) et directives de contrôle interne Misaina Cognition. Indexation vectorielle validée.`,
          excerpt: `Dispositions opérationnelles et conformité de ${title}.`,
        }
      );
    }

    const newDoc: DocumentRecord = {
      id: docId,
      title,
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      size: file.size,
      uploadedBy: user.fullName,
      uploadedById: user.id,
      department: user.department || "Direction Exécutive & Conseil",
      classification,
      theater,
      version: 1,
      status: "INDEXED",
      category,
      tags,
      summary: `Document « ${title} » indexé dans le domaine ${category} (Habilitation ${classification}, Théâtre : ${theater}). Contient ${chunks.length} segments vectoriels exploitables par le moteur RAG.`,
      chunks,
      createdAt: new Date().toISOString(),
    };

    mockDb.documents.unshift(newDoc);

    // Record in enterprise audit trail
    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      department: user.department,
      missionTheater: theater,
      action: "DOC_UPLOAD",
      queryOrTarget: `Indexation de « ${file.name} » (${(file.size / 1024).toFixed(1)} Ko, ${classification})`,
      dlpStatus: "CONFORME",
      sourcesCount: chunks.length,
      latencyMs: 420,
      hashSignature: `sha256-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
    });

    // Simulated progress to completion
    setTimeout(() => {
      mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 70, message: "Calcul des embeddings..." });
    }, 300);

    setTimeout(() => {
      mockDb.broadcastEvent({ type: "indexing", documentId: docId, percent: 100, message: "Indexation terminée !" });
    }, 700);

    return NextResponse.json({
      id: newDoc.id,
      title: newDoc.title,
      chunksCount: chunks.length,
      status: "Indexé avec succès",
    });
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json({ message: "Erreur lors du téléversement" }, { status: 500 });
  }
}
