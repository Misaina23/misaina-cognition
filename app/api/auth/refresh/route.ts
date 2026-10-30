import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;
    if (!refreshToken) {
      return NextResponse.json({ message: "Refresh token requis" }, { status: 400 });
    }
    const token = refreshToken.replace("mock-refresh-", "mock-token-");
    return NextResponse.json({ token, refreshToken });
  } catch {
    return NextResponse.json({ message: "Erreur refresh" }, { status: 500 });
  }
}
