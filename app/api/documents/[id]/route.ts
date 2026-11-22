import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = mockDb.documents.find((d) => d.id === id);
  if (!doc) return NextResponse.json({ message: "Document introuvable" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const index = mockDb.documents.findIndex((d) => d.id === id);
  if (index !== -1) {
    mockDb.documents.splice(index, 1);
  }
  return new NextResponse(null, { status: 204 });
}
