"use client";

import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, Database, Filter, MapPin, ShieldCheck } from "lucide-react";
import type { Anomaly, DataSourceConfig, NormalizedRecord } from "@/lib/api";

type PeriodFilter = "all" | "30" | "90";
type RecordFilter = "active" | "all";

interface GeneratedDataDashboardProps {
  records: NormalizedRecord[];
  anomalies: Anomaly[];
  sources: DataSourceConfig[];
  generatedAt: string;
}

function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

function sourceLabel(source: DataSourceConfig | undefined, sourceType: string): string {
  if (!source) return sourceType.toUpperCase();
  if (source.type === "generic") return (source.format || source.type).toUpperCase();
  return source.type.toUpperCase();
}

function recordDate(record: NormalizedRecord): Date | null {
  const raw = record.recordedAt || record.createdAt;
  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function BarList({
  title,
  description,
  rows,
  selectedValue,
  onSelect,
  emptyText,
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; value: number; key: string }>;
  selectedValue?: string;
  onSelect?: (key: string) => void;
  emptyText: string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const content = (
              <>
                <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
                <span className="w-12 text-right font-mono tabular-nums">
                  {formatNumber(row.value)}
                </span>
                <span className="h-2 w-24 overflow-hidden rounded-full bg-muted sm:w-32">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${row.value > 0 ? Math.max(3, (row.value / maxValue) * 100) : 0}%` }}
                  />
                </span>
              </>
            );

            return onSelect ? (
              <button
                type="button"
                key={row.key}
                onClick={() => onSelect(row.key)}
                aria-pressed={selectedValue === row.key}
                className={`flex w-full items-center gap-3 rounded-md text-xs hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                  selectedValue === row.key ? "font-semibold text-primary" : "text-foreground"
                }`}
              >
                {content}
              </button>
            ) : (
              <div key={row.key} className="flex items-center gap-3 text-xs text-foreground">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function GeneratedDataDashboard({
  records,
  anomalies,
  sources,
  generatedAt,
}: GeneratedDataDashboardProps) {
  const [sourceFilter, setSourceFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [recordFilter, setRecordFilter] = useState<RecordFilter>("active");

  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources]);
  const availableSources = useMemo(() => {
    const ids = new Set(records.map((record) => record.sourceId));
    return [...ids].map((id) => {
      const source = sourceById.get(id);
      const sourceType = records.find((record) => record.sourceId === id)?.sourceType || "source";
      return {
        id,
        label: source ? `${source.name} (${sourceLabel(source, sourceType)})` : sourceLabel(source, sourceType),
      };
    });
  }, [records, sourceById]);
  const availableZones = useMemo(
    () =>
      [...new Set(records.map((record) => record.zone?.trim()).filter((zone): zone is string => Boolean(zone)))].sort(
        (a, b) => a.localeCompare(b, "fr")
      ),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const cutoff = periodFilter === "all" ? null : Date.now() - Number(periodFilter) * 24 * 60 * 60 * 1000;
    return records.filter((record) => {
      if (recordFilter === "active" && record.status !== "active") return false;
      if (sourceFilter !== "all" && record.sourceId !== sourceFilter) return false;
      if (zoneFilter === "__missing__" && record.zone?.trim()) return false;
      if (
        zoneFilter !== "all" &&
        zoneFilter !== "__missing__" &&
        record.zone?.trim() !== zoneFilter
      ) {
        return false;
      }
      if (cutoff !== null) {
        const date = recordDate(record);
        if (!date || date.getTime() < cutoff) return false;
      }
      return true;
    });
  }, [periodFilter, recordFilter, records, sourceFilter, zoneFilter]);

  const dashboardStats = useMemo(() => {
    const recordIds = new Set(filteredRecords.map((record) => record.id));
    const openAnomalies = anomalies.filter(
      (anomaly) => recordIds.has(anomaly.recordId) && anomaly.status === "open"
    );
    const flaggedRecordIds = new Set(openAnomalies.map((anomaly) => anomaly.recordId));
    const cleanRate =
      filteredRecords.length > 0
        ? ((filteredRecords.length - flaggedRecordIds.size) / filteredRecords.length) * 100
        : 0;
    const zoneCounts = new Map<string, number>();
    for (const record of filteredRecords) {
      const zone = record.zone?.trim() || "Zone non renseignée";
      zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);
    }

    const datedRecords = filteredRecords
      .map((record) => ({ record, date: recordDate(record) }))
      .filter((entry): entry is { record: NormalizedRecord; date: Date } => entry.date !== null);
    const latestDate = datedRecords.reduce<Date | null>(
      (latest, entry) => (latest === null || entry.date > latest ? entry.date : latest),
      null
    );
    const monthlyCounts = new Map<string, number>();
    if (latestDate) {
      for (let offset = 5; offset >= 0; offset -= 1) {
        const month = new Date(latestDate.getFullYear(), latestDate.getMonth() - offset, 1);
        const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
        monthlyCounts.set(key, 0);
      }
      for (const entry of datedRecords) {
        const key = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyCounts.has(key)) monthlyCounts.set(key, monthlyCounts.get(key)! + 1);
      }
    }

    const fields = [
      { label: "Zone", present: (record: NormalizedRecord) => Boolean(record.zone?.trim()) },
      { label: "Âge", present: (record: NormalizedRecord) => record.age !== null },
      { label: "Enquêteur", present: (record: NormalizedRecord) => Boolean(record.enumeratorId?.trim()) },
      {
        label: "Date de collecte",
        present: (record: NormalizedRecord) =>
          Boolean(
            record.recordedAt && !Number.isNaN(new Date(record.recordedAt).getTime())
          ),
      },
    ].map((field) => ({
      label: field.label,
      value:
        filteredRecords.length === 0
          ? 0
          : Math.round(
              (filteredRecords.filter((record) => field.present(record)).length /
                filteredRecords.length) *
                100
            ),
      key: field.label,
    }));

    const severityCounts = [
      { label: "Bloquantes", key: "bloquante", value: 0 },
      { label: "À vérifier", key: "a_verifier", value: 0 },
      { label: "Mineures", key: "mineure", value: 0 },
    ].map((item) => ({
      ...item,
      value: openAnomalies.filter((anomaly) => anomaly.severity === item.key).length,
    }));

    return {
      openAnomalies: openAnomalies.length,
      flaggedRecords: flaggedRecordIds.size,
      cleanRate,
      zoneCount: zoneCounts.size,
      zoneRows: [...zoneCounts.entries()]
        .map(([label, value]) => ({ label, value, key: label }))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "fr"))
        .slice(0, 8),
      monthlyRows: [...monthlyCounts.entries()].map(([key, value]) => ({
        key,
        label: new Date(`${key}-01T12:00:00`).toLocaleDateString("fr-FR", {
          month: "short",
          year: "2-digit",
        }),
        value,
      })),
      completenessRows: fields,
      severityRows: severityCounts,
      datedCount: datedRecords.length,
    };
  }, [anomalies, filteredRecords]);

  const generatedLabel = new Date(generatedAt).toLocaleString("fr-FR");

  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <BarChart3 size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold">Tableau de bord des collectes</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Indicateurs calculés à partir des enregistrements importés. Les filtres s&apos;appliquent
              à tous les graphiques; aucune donnée n&apos;est estimée ni générée par l&apos;IA.
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Généré le {generatedLabel} · {sources.length} source(s) disponible(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database size={14} />
          <span>{formatNumber(records.length)} enregistrement(s) importé(s)</span>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <Filter size={13} /> Source
          </span>
          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2"
          >
            <option value="all">Toutes les sources</option>
            {availableSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <MapPin size={13} /> Zone
          </span>
          <select
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2"
          >
            <option value="all">Toutes les zones</option>
            {availableZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <CalendarDays size={13} /> Période
          </span>
          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2"
          >
            <option value="all">Toute la période</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck size={13} /> Dossiers
          </span>
          <select
            value={recordFilter}
            onChange={(event) => setRecordFilter(event.target.value as RecordFilter)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2"
          >
            <option value="active">Actifs uniquement</option>
            <option value="all">Tous les statuts</option>
          </select>
        </label>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Database size={24} className="mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">Aucune donnée pour ces filtres</h3>
          <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
            Importez un fichier Excel (.xlsx), CSV, ou synchronisez une source CommCare / Kobo, puis
            actualisez le tableau de bord.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Enregistrements filtrés" value={formatNumber(filteredRecords.length)} detail={`${formatNumber(dashboardStats.datedCount)} avec date exploitable`} />
            <MetricCard label="Qualité sans anomalie ouverte" value={`${dashboardStats.cleanRate.toFixed(1)} %`} detail={`${formatNumber(dashboardStats.flaggedRecords)} fiche(s) concernée(s)`} />
            <MetricCard label="Anomalies ouvertes" value={formatNumber(dashboardStats.openAnomalies)} detail="À traiter ou vérifier" />
            <MetricCard label="Zones couvertes" value={formatNumber(dashboardStats.zoneCount)} detail="Selon les valeurs présentes dans les données" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <BarList
              title="Soumissions par mois"
              description="Six mois jusqu’à la dernière date trouvée; utilise la date d’import si la date de collecte manque."
              rows={dashboardStats.monthlyRows}
              emptyText="Aucune date exploitable pour établir une tendance."
            />
            <BarList
              title="Enregistrements par zone"
              description="Sélectionnez une zone pour filtrer l’ensemble du tableau."
              rows={dashboardStats.zoneRows}
              selectedValue={zoneFilter}
              onSelect={(zone) => {
                const value = zone === "Zone non renseignée" ? "__missing__" : zone;
                setZoneFilter(zoneFilter === value ? "all" : value);
              }}
              emptyText="Aucune zone renseignée dans les enregistrements filtrés."
            />
            <BarList
              title="Anomalies ouvertes par sévérité"
              description={`${formatNumber(dashboardStats.flaggedRecords)} enregistrement(s) avec au moins une anomalie ouverte.`}
              rows={dashboardStats.severityRows}
              emptyText="Aucune anomalie ouverte pour ces filtres."
            />
            <BarList
              title="Complétude des champs"
              description="Part des dossiers contenant chaque champ. Ce taux ne signifie pas que la valeur est valide."
              rows={dashboardStats.completenessRows}
              emptyText="Aucune donnée disponible."
            />
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
