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
    version: d.version,
    status: d.status,
    createdAt: d.createdAt,
  }));
  return NextResponse.json(docs);
}
