import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  const users = mockDb.users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    department: u.department,
    clearanceLevel: u.clearanceLevel || "C2",
    isActive: u.isActive,
    emailConfirmed: u.emailConfirmed,
    createdAt: u.createdAt,
  }));
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  try {
    const { fullName, email, role, department, clearanceLevel } = await req.json();
    if (!fullName || !email) {
      return NextResponse.json({ message: "Nom et email requis" }, { status: 400 });
    }

    const existing = mockDb.findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ message: "Un utilisateur avec cet email existe déjà" }, { status: 409 });
    }

    const newUser = mockDb.createUser({
      fullName,
      email,
      role: role || "EMPLOYEE",
      department: department || "General",
      clearanceLevel: clearanceLevel || "C2",
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch {
    return NextResponse.json({ message: "Erreur lors de la création" }, { status: 500 });
  }
}
