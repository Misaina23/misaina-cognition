import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (email) {
      const token = `reset-${Date.now()}`;
      mockDb.resetTokens.set(token, email);
    }
    return NextResponse.json({ message: "Si le compte existe, un email a été envoyé." });
  } catch {
    return NextResponse.json({ message: "Une erreur est survenue" }, { status: 500 });
  }
}
