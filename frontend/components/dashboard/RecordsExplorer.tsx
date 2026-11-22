"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  MapPin,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import type { Anomaly, NormalizedRecord } from "@/lib/api";

interface RecordsExplorerProps {
  records: NormalizedRecord[];
  anomalies: Anomaly[];
  downloadingCsv: boolean;
  onDownloadCleanCsv: () => void;
}

const PAGE_SIZE = 20;

export function RecordsExplorer({
  records,
  anomalies,
  downloadingCsv,
  onDownloadCleanCsv,
}: RecordsExplorerProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | NormalizedRecord["status"]>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "age">("recent");
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<NormalizedRecord | null>(null);

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      if (r.zone?.trim()) set.add(r.zone.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [records]);

  const anomalyCountsByRecord = useMemo(() => {
    const map = new Map<string, Anomaly[]>();
    for (const a of anomalies) {
      const list = map.get(a.recordId) || [];
      list.push(a);
      map.set(a.recordId, list);
      if (a.relatedRecordId) {
        const rel = map.get(a.relatedRecordId) || [];
        rel.push(a);
        map.set(a.relatedRecordId, rel);
      }
    }
    return map;
  }, [anomalies]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = records.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (zoneFilter !== "all" && (r.zone || "").trim() !== zoneFilter) return false;
      if (!q) return true;
      return (
        (r.externalId || "").toLowerCase().includes(q) ||
        (r.fullName || "").toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q) ||
        (r.zone || "").toLowerCase().includes(q) ||
        (r.enumeratorId || "").toLowerCase().includes(q)
      );
    });

    if (sortBy === "name") {
      return [...list].sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "fr"));
    }
    if (sortBy === "age") {
      return [...list].sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
    }
    return list;
  }, [records, search, sortBy, statusFilter, zoneFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, zoneFilter, sortBy]);

  useEffect(() => {
    if (!selectedRecord) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedRecord(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedRecord]);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRecords.slice(start, start + PAGE_SIZE);
  }, [filteredRecords, safePage]);

  const selectedAnomalies = selectedRecord
    ? anomalyCountsByRecord.get(selectedRecord.id) || []
    : [];

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Enregistrements normalisés ({filteredRecords.length} / {records.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Conservation intégrale sans suppression physique : cliquez sur une fiche pour inspecter ses attributs et anomalies associées.
          </p>
        </div>
        <button
          type="button"
          onClick={onDownloadCleanCsv}
          disabled={downloadingCsv || records.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet size={12} />
          {downloadingCsv ? "Export CSV…" : "Télécharger base nettoyée (.csv)"}
        </button>
      </div>

      {/* Filters toolbar */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, ID, téléphone, enquêteur…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
          />
        </div>
        <select
          aria-label="Filtrer par statut d'enregistrement"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | NormalizedRecord["status"])}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs uniquement</option>
          <option value="merged">Fusionnés</option>
          <option value="archived">Archivés</option>
        </select>
        <select
          aria-label="Filtrer par zone"
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        >
          <option value="all">Toutes les zones</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select
          aria-label="Trier les enregistrements"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "age")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
        >
          <option value="recent">Ordre d&apos;ingestion</option>
          <option value="name">Nom complet (A-Z)</option>
          <option value="age">Âge décroissant</option>
        </select>
      </div>

      {paginated.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/60 p-6 text-center text-xs text-muted-foreground">
          Aucun enregistrement ne correspond à ces critères de recherche.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">ID externe</th>
                  <th className="py-2 pr-3">Nom complet</th>
                  <th className="py-2 pr-3">Enquêteur</th>
                  <th className="py-2 pr-3">Téléphone</th>
                  <th className="py-2 pr-3">Âge</th>
                  <th className="py-2 pr-3">GPS / Zone</th>
                  <th className="py-2 pr-3">Statut</th>
                  <th className="py-2 text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginated.map((rec) => {
                  const linked = anomalyCountsByRecord.get(rec.id) || [];
                  return (
                    <tr
                      key={rec.id}
                      onClick={() => setSelectedRecord(rec)}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                        {rec.externalId}
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {rec.fullName || "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                        {rec.enumeratorId || "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">{rec.phone || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] tabular-nums">
                        {rec.age ?? "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        {rec.zone || "—"}
                        {rec.latitude !== null && rec.longitude !== null
                          ? ` (${rec.latitude.toFixed(3)}, ${rec.longitude.toFixed(3)})`
                          : ""}
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        <span
                          className={
                            rec.status === "active"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : rec.status === "merged"
                                ? "text-primary"
                                : "text-amber-600 dark:text-amber-400"
                          }
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(rec);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                        >
                          <Eye size={11} />
                          {linked.length > 0 ? `${linked.length} alerte(s)` : "Détails"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                Page {safePage} / {totalPages} · {filteredRecords.length} fiche(s)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft size={13} /> Précédent
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40"
                >
                  Suivant <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Record Inspection Slide-over Drawer */}
      {selectedRecord && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-drawer-title"
          onClick={() => setSelectedRecord(null)}
        >
          <aside
            className="flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4">
              <div className="space-y-1">
                <p className="font-mono text-[11px] uppercase tracking-wider text-primary">
                  Fiche Normalisée · {selectedRecord.externalId}
                </p>
                <h3 id="record-drawer-title" className="text-base font-bold text-foreground">
                  {selectedRecord.fullName || "Bénéficiaire sans nom renseigné"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Fermer la fiche"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Identifiant interne</span>
                  <span className="font-mono font-semibold text-foreground break-all">
                    {selectedRecord.id}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Statut &amp; Source</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedRecord.status} · {selectedRecord.sourceType.toUpperCase()}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Téléphone (E.164)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedRecord.phone || "—"}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Email</span>
                  <span className="font-mono font-semibold text-foreground break-all">
                    {selectedRecord.email || "—"}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Âge / Montant</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {selectedRecord.age ?? "—"} ans ·{" "}
                    {selectedRecord.amount !== null
                      ? selectedRecord.amount.toLocaleString("fr-FR")
                      : "—"}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/70 p-3">
                  <span className="text-[11px] text-muted-foreground block">Enquêteur</span>
                  <span className="font-mono font-semibold text-foreground">
                    {selectedRecord.enumeratorId || "—"}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background/70 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                  <MapPin size={13} className="text-primary" /> Localisation terrain
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Zone : {selectedRecord.zone || "Non précisée"} · GPS :{" "}
                  {selectedRecord.latitude !== null && selectedRecord.longitude !== null
                    ? `${selectedRecord.latitude.toFixed(5)}, ${selectedRecord.longitude.toFixed(5)}`
                    : "Absent"}
                </p>
                {selectedRecord.mergedIntoId && (
                  <p className="font-mono text-[11px] text-primary">
                    Fusionné vers : {selectedRecord.mergedIntoId}
                  </p>
                )}
                {selectedRecord.archivedReason && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Motif d&apos;archivage : {selectedRecord.archivedReason}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <ShieldAlert size={14} className="text-primary" />
                  Anomalies rattachées ({selectedAnomalies.length})
                </div>
                {selectedAnomalies.length === 0 ? (
                  <div className="rounded-lg border border-border bg-background/60 p-3 text-muted-foreground">
                    Aucune anomalie détectée sur cet enregistrement.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedAnomalies.map((an) => (
                      <div
                        key={an.id}
                        className="rounded-lg border border-border bg-background/70 p-3 space-y-1"
                      >
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span
                            className={`font-semibold uppercase ${
                              an.severity === "bloquante"
                                ? "text-red-600 dark:text-red-400"
                                : an.severity === "a_verifier"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-primary"
                            }`}
                          >
                            {an.severity} · {an.ruleId}
                          </span>
                          <span className="text-muted-foreground">{an.status}</span>
                        </div>
                        <p className="text-foreground leading-relaxed">{an.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-3 font-mono text-[10px] text-muted-foreground">
                Horodatage d&apos;ingestion :{" "}
                {new Date(selectedRecord.createdAt).toLocaleString("fr-FR")}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
