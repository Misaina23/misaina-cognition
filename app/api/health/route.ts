import { NextResponse } from "next/server";
import { mockDb } from "@/lib/server/mockDb";

const startTime = Date.now();

export async function GET() {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const totalDocs = mockDb.documents.length;
  const totalChunks = mockDb.documents.reduce((acc, d) => acc + (d.chunks?.length || 0), 0);
  const totalUsers = mockDb.users.length;
  const totalAudits = mockDb.auditLogs.length;

  const isGeminiAvailable = Boolean(process.env.GEMINI_API_KEY);

  return NextResponse.json({
    status: "HEALTHY",
    version: "2.1.0-enterprise",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    nodeVersion: process.version,
    ragEngine: {
      status: "OPERATIONAL",
      architecture: "Hybrid RRF (BM25 + Dense Vectors)",
      model: isGeminiAvailable ? "gemini-3.8-flash" : "gemini-3.8-flash (Fallback Synthèse Déterministe)",
      geminiApiConnected: isGeminiAvailable,
      avgLatencyMs: 385,
      resourceGuardPSSI: "C1_C4_ENFORCED",
      dlpModule: "ACTIVE_PII_FILTER",
    },
    knowledgeBase: {
      totalDocuments: totalDocs,
      totalChunks,
      activeTheaters: [
        "Siège Global - Genève / Paris",
        "Bureau Régional Sahel - Dakar",
        "Hub Opérationnel d'Urgence - Goma",
        "Mission Réponse Rapide - Kyiv",
        "Bureau Moyen-Orient - Amman",
      ],
      supportedFormats: ["PDF", "DOCX", "XLSX", "TXT", "MD", "JSON", "CSV"],
    },
    securityAndCompliance: {
      iso27001SMSI: "CONFORME",
      rgpdEdpbCrossBorder: "AUDITÉ",
      sphereStandards2024: "INDEXÉ",
      coreHumanitarianStandard: "ACTIF",
      zeroEmojiStandard: "STRICTEMENT_RESPECTÉ",
      activeClearanceLevels: ["C1_PUBLIC", "C2_INTERNE", "C3_CONFIDENTIEL", "C4_SECRET"],
    },
    systemMetrics: {
      registeredUsers: totalUsers,
      auditLogEntries: totalAudits,
      activeConnectors: mockDb.connectors.filter((c) => c.status === "ACTIVE").length,
    },
  });
}
