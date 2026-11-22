import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, fullName, password, role, department } = body;

    if (!email || !fullName) {
      return NextResponse.json({ message: "Champs requis manquants" }, { status: 400 });
    }

    const existing = mockDb.findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ message: "Un compte existe déjà avec cet email." }, { status: 409 });
    }

    const user = mockDb.createUser({
      email,
      fullName,
      password: password || "password123",
      role: role || "EMPLOYEE",
      department: department || "General",
    });

    const token = `mock-token-${user.id}`;
    const refreshToken = `mock-refresh-${user.id}`;

    return NextResponse.json({
      token,
      refreshToken,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
    });
  } catch (error) {
    return NextResponse.json({ message: "Erreur lors de l'inscription" }, { status: 500 });
  }
}
