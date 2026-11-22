import { NextRequest, NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const q = (searchParams.get("q") || "").toLowerCase();
  const dlp = searchParams.get("dlp");
  const action = searchParams.get("action");

  let logs = [...mockDb.auditLogs];

  if (q) {
    logs = logs.filter(
      (l) =>
        l.queryOrTarget.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.department.toLowerCase().includes(q) ||
        l.hashSignature.toLowerCase().includes(q)
    );
  }

  if (dlp && dlp !== "ALL") {
    logs = logs.filter((l) => l.dlpStatus === dlp);
  }

  if (action && action !== "ALL") {
    logs = logs.filter((l) => l.action === action);
  }

  return NextResponse.json({
    total: logs.length,
    conformeCount: mockDb.auditLogs.filter((l) => l.dlpStatus === "CONFORME").length,
    piiCount: mockDb.auditLogs.filter((l) => l.dlpStatus === "PII_MASQUE").length,
    logs,
  });
}
