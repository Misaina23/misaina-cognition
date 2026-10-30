import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  const docs = mockDb.documents.map((d) => ({
    id: d.id,
    title: d.title,
    fileName: d.fileName,
    fileType: d.fileType,
    size: d.size,
    uploadedBy: d.uploadedBy,
    department: d.department,
    classification: d.classification || "C2",
    theater: d.theater || "Tous",
    category: d.category || "Général",
    tags: d.tags || "",
    summary: d.summary || "",
    version: d.version,
    status: d.status,
    createdAt: d.createdAt,
    chunksCount: d.chunks?.length || 0,
  }));
  return NextResponse.json(docs);
}
