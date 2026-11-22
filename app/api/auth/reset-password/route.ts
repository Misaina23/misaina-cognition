import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!password) {
      return NextResponse.json({ message: "Nouveau mot de passe requis." }, { status: 400 });
    }
    const email = mockDb.resetTokens.get(token);
    if (email) {
      const user = mockDb.findUserByEmail(email);
      if (user) user.password = password;
      mockDb.resetTokens.delete(token);
    }
    return NextResponse.json({ message: "Mot de passe réinitialisé avec succès." });
  } catch {
    return NextResponse.json({ message: "Échec de réinitialisation" }, { status: 500 });
  }
}
