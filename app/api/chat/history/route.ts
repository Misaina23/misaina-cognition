import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server/authHelper";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(req: NextRequest) {
  const user = getAuthUser(req) || mockDb.users[0];
  const history = mockDb.conversations.filter((c) => c.userId === user.id);
  return NextResponse.json(history);
}
