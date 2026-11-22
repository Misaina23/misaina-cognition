import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = mockDb.findUserById(id);
  if (!user) return NextResponse.json({ message: "Utilisateur introuvable" }, { status: 404 });

  const body = await req.json();
  if (body.role) user.role = body.role;
  if (body.department) user.department = body.department;
  if (body.isActive !== undefined) user.isActive = body.isActive;

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const index = mockDb.users.findIndex((u) => u.id === id);
  if (index !== -1) {
    mockDb.users.splice(index, 1);
  }
  return new NextResponse(null, { status: 204 });
}
