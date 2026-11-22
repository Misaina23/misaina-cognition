import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb, DocumentRecord } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const documents = body.documents as DocumentRecord[];

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ message: "Pack documentaire invalide ou vide" }, { status: 400 });
    }

    const user = getAuthUser(req) || mockDb.users[0];
    let importedCount = 0;

    for (const doc of documents) {
      if (!doc.title || !doc.chunks) continue;
      const exists = mockDb.documents.some((d) => d.id === doc.id);
      if (!exists) {
        mockDb.documents.push(doc);
        importedCount += 1;
      }
    }

    // Log in audit trail
    mockDb.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.fullName,
      userEmail: user.email,
      department: user.department,
      action: "BACKUP_IMPORT",
      queryOrTarget: `Restauration de pack mission : ${importedCount} documents indexés`,
      dlpStatus: "CONFORME",
      sourcesCount: importedCount,
      latencyMs: 510,
      hashSignature: `sha256-${Math.random().toString(36).substring(2, 15)}`,
    });

    return NextResponse.json({
      success: true,
      importedCount,
      totalDocuments: mockDb.documents.length,
      message: `${importedCount} document(s) importé(s) et indexé(s) dans la base.`,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ message: "Erreur lors de l'import du pack" }, { status: 500 });
  }
}
