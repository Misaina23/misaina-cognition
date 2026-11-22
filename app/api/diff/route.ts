import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET() {
  return NextResponse.json(mockDb.documentDiffs);
}
