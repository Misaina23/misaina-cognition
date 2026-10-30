import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email) {
      return NextResponse.json({ message: "Email requis" }, { status: 400 });
    }

    let user = mockDb.findUserByEmail(email);
    if (!user) {
      // Auto-provision demo user if email is entered
      user = mockDb.createUser({
        email,
        fullName: email.split("@")[0].replace(".", " "),
        password: password || "password123",
        role: email.includes("admin") ? "ADMIN" : email.includes("manager") ? "MANAGER" : "EMPLOYEE",
        department: "R&D",
      });
    }

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
    return NextResponse.json({ message: "Erreur serveur interne" }, { status: 500 });
  }
}
