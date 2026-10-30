import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ message: "Token manquant" }, { status: 400 });
  }
  return NextResponse.json({ message: "Email confirmé." });
}
