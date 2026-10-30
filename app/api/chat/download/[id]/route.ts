import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = mockDb.generatedDocs.find((g) => g.id === id);

  if (!doc) {
    return NextResponse.json({ message: "Document introuvable" }, { status: 404 });
  }

  const fileBytes = Buffer.from(doc.content, "utf-8");

  return new NextResponse(fileBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${doc.fileName}"`,
      "Content-Length": fileBytes.length.toString(),
    },
  });
}
