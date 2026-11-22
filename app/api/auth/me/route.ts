import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(req: NextRequest) {
  const user = getAuthUser(req) || mockDb.users[0];
  if (!user) {
    return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    department: user.department,
    clearanceLevel: user.clearanceLevel || "C2",
  });
}
