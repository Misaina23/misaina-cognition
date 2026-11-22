import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { TenantSpaceContext } from "../connectors/types";
import { journalRepo } from "../journal";
import { tenantSpacesRegistry } from "../tenant";

function makeCell(text: string, header = false): TableCell {
  return new TableCell({
    shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: "E5E7EB" } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: header,
            size: 18,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

function makeTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h) => makeCell(h, true)),
      }),
      ...(rows.length > 0
        ? rows.map(
            (r) =>
              new TableRow({
                children: r.map((cell) => makeCell(cell, false)),
              })
          )
        : [
            new TableRow({
              children: headers.map((_, idx) => makeCell(idx === 0 ? "Aucune donnée" : "—", false)),
            }),
          ]),
    ],
  });
}

function extractDayKey(isoOrDate?: string | null): string | null {
  if (!isoOrDate) return null;
  const trimmed = isoOrDate.trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (match) return match[1];
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Génère un rapport hebdomadaire .docx strictement isolé à l'espace (tenantId, spaceId)
 * avec ventilations par source, par zone et par jour.
 */
export async function generateWeeklySpaceDocxBuffer(
  ctx: TenantSpaceContext
): Promise<{ buffer: Buffer; fileName: string }> {
  const space = tenantSpacesRegistry.find(
    (s) => s.id === ctx.spaceId && s.tenantId === ctx.tenantId
  );
  const sources = journalRepo.listSources(ctx);
  const allRecords = journalRepo.listNormalizedRecords(ctx, { includeArchived: true });
  const runs = journalRepo.listRuns(ctx);
  const anomalies = journalRepo.listAnomalies(ctx);
  const validations = journalRepo.listValidations(ctx);

  const now = new Date();
  const sevenDaysAgoMs = now.getTime() - 7 * 86_400_000;
  const recentRuns = runs.filter((r) => Date.parse(r.startedAt) >= sevenDaysAgoMs);
  const recentRecords = allRecords.filter((r) => Date.parse(r.createdAt) >= sevenDaysAgoMs);
  const recentAnomalies = anomalies.filter((a) => Date.parse(a.createdAt) >= sevenDaysAgoMs);

  const anomaliesByRecordId = new Map<string, number>();
  for (const a of anomalies) {
    anomaliesByRecordId.set(a.recordId, (anomaliesByRecordId.get(a.recordId) || 0) + 1);
  }

  // 1. Ventilation par source
  const sourceRows = sources.map((src) => {
    const srcRecs = allRecords.filter((r) => r.sourceId === src.id);
    const activeCount = srcRecs.filter((r) => r.status === "active").length;
    const cleanedCount = srcRecs.filter((r) => r.status !== "active").length;
    const recentCount = srcRecs.filter((r) => Date.parse(r.createdAt) >= sevenDaysAgoMs).length;
    const anomCount = srcRecs.reduce((acc, r) => acc + (anomaliesByRecordId.get(r.id) || 0), 0);
    return [
      src.name,
      src.type.toUpperCase(),
      String(activeCount),
      String(cleanedCount),
      String(recentCount),
      String(anomCount),
    ];
  });

  // 2. Ventilation par zone
  const zoneStats = new Map<
    string,
    { active: number; cleaned: number; amountSum: number; anomalies: number }
  >();
  for (const rec of allRecords) {
    const z = rec.zone || "(Non renseignée)";
    const cur = zoneStats.get(z) || { active: 0, cleaned: 0, amountSum: 0, anomalies: 0 };
    if (rec.status === "active") cur.active += 1;
    else cur.cleaned += 1;
    if (rec.amount !== null) cur.amountSum += rec.amount;
    cur.anomalies += anomaliesByRecordId.get(rec.id) || 0;
    zoneStats.set(z, cur);
  }
  const zoneRows = Array.from(zoneStats.entries())
    .sort((a, b) => b[1].active - a[1].active)
    .map(([zoneName, st]) => {
      const totalRecs = st.active + st.cleaned;
      const avg = totalRecs > 0 ? Math.round(st.amountSum / totalRecs) : 0;
      return [
        zoneName,
        String(st.active),
        String(st.cleaned),
        st.amountSum.toLocaleString("fr-FR"),
        avg.toLocaleString("fr-FR"),
        String(st.anomalies),
      ];
    });

  // 3. Ventilation par jour (7 derniers jours + jours d'activité)
  const dayStats = new Map<string, { ingested: number; runs: number; anomalies: number }>();
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    dayStats.set(d, { ingested: 0, runs: 0, anomalies: 0 });
  }
  for (const rec of allRecords) {
    const d = extractDayKey(rec.createdAt) || extractDayKey(rec.recordedAt);
    if (!d) continue;
    const cur = dayStats.get(d) || { ingested: 0, runs: 0, anomalies: 0 };
    cur.ingested += 1;
    dayStats.set(d, cur);
  }
  for (const r of runs) {
    const d = extractDayKey(r.startedAt);
    if (!d) continue;
    const cur = dayStats.get(d) || { ingested: 0, runs: 0, anomalies: 0 };
    cur.runs += 1;
    dayStats.set(d, cur);
  }
  for (const a of anomalies) {
    const d = extractDayKey(a.createdAt);
    if (!d) continue;
    const cur = dayStats.get(d) || { ingested: 0, runs: 0, anomalies: 0 };
    cur.anomalies += 1;
    dayStats.set(d, cur);
  }

  const dayRows = Array.from(dayStats.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14)
    .map(([day, st]) => [day, String(st.ingested), String(st.runs), String(st.anomalies)]);

  const totalTokens = runs.reduce((s, r) => s + (r.tokensUsed || 0), 0);
  const totalCostUsd = runs.reduce((s, r) => s + (r.estimatedCostUsd || 0), 0);
  const totalLlmCalls = runs.reduce((s, r) => s + (r.llmCallsCount || 0), 0);
  const totalDurationMs = runs.reduce((s, r) => s + (r.durationMs || 0), 0);

  const pendingVal = validations.filter((v) => v.status === "pending").length;
  const approvedVal = validations.filter((v) => v.status === "approved").length;
  const rejectedVal = validations.filter((v) => v.status === "rejected").length;

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `Rapport Hebdomadaire MEAL — ${space?.name || ctx.spaceId}`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Plateforme MEAL (Monitoring, Evaluation, Accountability & Learning) | Tenant : ${ctx.tenantId} | Espace : ${ctx.spaceId} | Généré le ${now.toLocaleString("fr-FR")}`,
                size: 18,
                color: "555555",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "1. Synthèse MEAL de la semaine (7 derniers jours)", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: `Enregistrements totaux : ${allRecords.length} (dont ${recentRecords.length} ingérés sur 7 jours). Runs exécutés : ${runs.length} (${recentRuns.length} sur 7 jours). Anomalies détectées : ${anomalies.length} (${recentAnomalies.length} sur 7 jours), dont ${anomalies.filter((a) => a.category === "enumerator_copy_paste").length} alerte(s) copier-coller enquêteur.`,
          }),
          new Paragraph({
            text: `Validations humaines : ${approvedVal} approuvée(s), ${rejectedVal} rejetée(s), ${pendingVal} en attente. Observabilité LLM cumulée : ${totalLlmCalls} appel(s), ${totalTokens} tokens, ${totalDurationMs} ms, coût estimé $${totalCostUsd.toFixed(6)}.`,
          }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "2. Indicateurs par source", heading: HeadingLevel.HEADING_1 }),
          makeTable(
            ["Source", "Type", "Actifs", "Nettoyés", "7 derniers jours", "Anomalies"],
            sourceRows
          ),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "3. Indicateurs par zone", heading: HeadingLevel.HEADING_1 }),
          makeTable(
            ["Zone", "Actifs", "Nettoyés", "Montant total", "Montant moyen", "Anomalies"],
            zoneRows
          ),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "4. Indicateurs par jour", heading: HeadingLevel.HEADING_1 }),
          makeTable(["Jour (UTC)", "Enregistrements", "Runs", "Anomalies"], dayRows),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeSpace = ctx.spaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dateTag = now.toISOString().slice(0, 10);
  return { buffer, fileName: `rapport-hebdo-${safeSpace}-${dateTag}.docx` };
}
