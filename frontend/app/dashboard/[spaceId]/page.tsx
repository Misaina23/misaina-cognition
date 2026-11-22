"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  FileCode2,
  FileSpreadsheet,
  GitMerge,
  MoonStar,
  Play,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import {
  guardianApi,
  type Anomaly,
  type DataRun,
  type DataSourceConfig,
  type NormalizedRecord,
} from "@/lib/api";

type ActiveTab = "operations" | "records" | "rules";

const SAMPLE_KOBO_JSON = JSON.stringify(
  [
    {
      _id: "kobo-101",
      nom_complet: "Kadiatou Traoré",
      telephone: "+221776001122",
      age: 31,
      _geolocation: [14.7167, -17.4677],
      zone: "Dakar",
    },
    {
      _id: "kobo-102",
      nom_complet: "Binta Diouf",
      telephone: "+221778889900",
      age: 162,
      _geolocation: [14.7167, -17.4677],
      zone: "Kaolack",
    },
  ],
  null,
  2
);

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}

export default function DashboardSpacePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [tab, setTab] = useState<ActiveTab>("operations");
  const [runs, setRuns] = useState<DataRun[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [sources, setSources] = useState<DataSourceConfig[]>([]);
  const [records, setRecords] = useState<NormalizedRecord[]>([]);
  const [yamlDraft, setYamlDraft] = useState("");

  const [severityFilter, setSeverityFilter] = useState<"all" | Anomaly["severity"]>("all");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mappingText, setMappingText] = useState("");
  const [uploading, setUploading] = useState(false);

  const [showConnectorForm, setShowConnectorForm] = useState(false);
  const [connName, setConnName] = useState("");
  const [connType, setConnType] = useState<"commcare" | "generic">("generic");
  const [connFormat, setConnFormat] = useState<"json" | "kobo" | "odk">("kobo");
  const [connEndpoint, setConnEndpoint] = useState("");

  const [showJsonForm, setShowJsonForm] = useState(false);
  const [jsonText, setJsonText] = useState(SAMPLE_KOBO_JSON);
  const [savingRules, setSavingRules] = useState(false);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const [runsRes, srcRes, recRes, rulesRes] = await Promise.all([
        guardianApi.getRuns(spaceId),
        guardianApi.getSources(spaceId),
        guardianApi.getRecords(spaceId, true),
        guardianApi.getRules(spaceId),
      ]);
      setRuns(runsRes.runs || []);
      setAnomalies(runsRes.anomalies || []);
      setSources(srcRes.sources || []);
      setRecords(recRes.records || []);
      setYamlDraft(rulesRes.rawYaml || "");
    } catch {
      setBanner({
        kind: "err",
        text: "Accès refusé ou espace introuvable pour ce tenant.",
      });
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRun(mode: "agent" | "nightly") {
    setRunning(true);
    setBanner(null);
    try {
      await guardianApi.triggerRun(spaceId, mode);
      await refresh();
      setBanner({
        kind: "ok",
        text:
          mode === "nightly"
            ? "Contrôle nocturne exécuté sur les espaces."
            : "Contrôle Gardien terminé.",
      });
    } catch {
      setBanner({ kind: "err", text: "Échec lors du lancement du contrôle." });
    } finally {
      setRunning(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setBanner(null);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      const columnMapping = mappingText.trim()
        ? (JSON.parse(mappingText.trim()) as Record<string, string>)
        : undefined;
      const res = await guardianApi.ingestFile({
        spaceId,
        fileName: selectedFile.name,
        fileBase64,
        columnMapping,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
      setBanner({
        kind: "ok",
        text: `${res.ingest.insertedCount} ligne(s) ingérée(s), ${res.ingest.skippedIdempotentCount} ignorée(s) (idempotence).`,
      });
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "Erreur lors de l'import du fichier.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleJsonIngest(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    try {
      const items = JSON.parse(jsonText) as Record<string, unknown>[];
      if (!Array.isArray(items)) throw new Error("Le JSON doit être un tableau d'objets.");
      const res = await guardianApi.ingestJson({ spaceId, rawItems: items });
      setShowJsonForm(false);
      await refresh();
      setBanner({
        kind: "ok",
        text: `${res.ingest.insertedCount} soumission(s) JSON ingérée(s), ${res.ingest.skippedIdempotentCount} ignorée(s).`,
      });
    } catch (err) {
      setBanner({
        kind: "err",
        text: err instanceof Error ? err.message : "JSON invalide.",
      });
    }
  }

  async function handleAddConnector(e: React.FormEvent) {
    e.preventDefault();
    if (!connName.trim()) return;
    try {
      await guardianApi.registerSource({
        spaceId,
        name: connName.trim(),
        type: connType,
        format: connType === "generic" ? connFormat : undefined,
        endpointUrl: connEndpoint.trim() || undefined,
      });
      setConnName("");
      setConnEndpoint("");
      setShowConnectorForm(false);
      await refresh();
      setBanner({ kind: "ok", text: "Connecteur enregistré dans cet espace." });
    } catch {
      setBanner({ kind: "err", text: "Paramètres du connecteur invalides." });
    }
  }

  async function handleSaveRules() {
    setSavingRules(true);
    setBanner(null);
    try {
      await guardianApi.saveRules(spaceId, yamlDraft);
      await refresh();
      setBanner({ kind: "ok", text: "Règles YAML validées et enregistrées." });
    } catch {
      setBanner({ kind: "err", text: "YAML invalide : vérifiez la structure." });
    } finally {
      setSavingRules(false);
    }
  }

  const latest = runs[0];
  const cleanedCount = records.filter(
    (r) => r.status === "merged" || r.status === "archived"
  ).length;
  const filteredAnomalies = useMemo(() => {
    if (severityFilter === "all") return anomalies;
    return anomalies.filter((a) => a.severity === severityFilter);
  }, [anomalies, severityFilter]);

  return (
    <div className="min-h-screen">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="overview"
        title={`Espace ${spaceId} — Runs, Doublons & Anomalies`}
        subtitle="Ingestion multi-sources, règles YAML (dont GPS vs zone d'intervention), déduplication et actions 100 % réversibles."
        actions={
          <>
            <button
              onClick={() => void handleRun("agent")}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              <Play size={13} />
              {running ? "Analyse…" : "Lancer un contrôle"}
            </button>
            <button
              onClick={() => void handleRun("nightly")}
              disabled={running}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
            >
              <MoonStar size={13} /> Tâche nocturne
            </button>
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Actualiser"
            >
              <RefreshCw size={14} />
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {banner && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-medium ${
              banner.kind === "err"
                ? "border-red-500/30 bg-red-500/10 text-red-700"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
            }`}
          >
            {banner.text}
          </div>
        )}

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Enregistrements</span>
              <Database size={14} />
            </div>
            <div className="text-2xl font-bold font-mono">{records.length}</div>
            <div className="text-[11px] text-muted-foreground">
              {latest ? `${latest.recordsProcessed} traités au dernier run` : "Brut immuable conservé"}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Doublons détectés</span>
              <GitMerge size={14} />
            </div>
            <div className="text-2xl font-bold font-mono">{latest?.duplicatesFound ?? 0}</div>
            <div className="text-[11px] text-muted-foreground">Exacts + quasi-doublons</div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Anomalies détectées</span>
              <AlertTriangle size={14} className="text-amber-600" />
            </div>
            <div className="text-2xl font-bold font-mono">{anomalies.length}</div>
            <div className="text-[11px] text-muted-foreground">Règles YAML & écarts GPS/zone</div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-1 shadow-sm">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Lignes nettoyées</span>
              <Archive size={14} />
            </div>
            <div className="text-2xl font-bold font-mono">{cleanedCount}</div>
            <div className="text-[11px] text-muted-foreground">Fusionnées ou archivées (réversible)</div>
          </div>
        </section>

        {/* Onglets */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <button
            onClick={() => setTab("operations")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === "operations"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            <Activity size={13} /> Ingestion, Runs & Anomalies
          </button>
          <button
            onClick={() => setTab("records")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === "records"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            <Database size={13} /> Enregistrements ({records.length})
          </button>
          <button
            onClick={() => setTab("rules")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === "rules"
                ? "bg-foreground text-background"
                : "border border-border bg-card text-muted-foreground"
            }`}
          >
            <FileCode2 size={13} /> Règles YAML
          </button>
        </div>

        {tab === "operations" && (
          <div className="space-y-6">
            {/* Sources + Upload */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Sources connectées ({sources.length})</h2>
                    <p className="text-xs text-muted-foreground">
                      CSV, Excel, CommCare, Kobo/ODK et ingestion JSON directe.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowJsonForm((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Upload size={12} /> JSON / Kobo
                    </button>
                    <button
                      onClick={() => setShowConnectorForm((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Plus size={12} /> Connecteur
                    </button>
                  </div>
                </div>

                {showConnectorForm && (
                  <form
                    onSubmit={handleAddConnector}
                    className="rounded-lg border border-border bg-muted/40 p-3 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs"
                  >
                    <input
                      required
                      placeholder="Nom source"
                      value={connName}
                      onChange={(e) => setConnName(e.target.value)}
                      className="rounded border border-border bg-background px-2.5 py-1.5"
                    />
                    <select
                      value={connType}
                      onChange={(e) => setConnType(e.target.value as "commcare" | "generic")}
                      className="rounded border border-border bg-background px-2 py-1.5"
                    >
                      <option value="generic">Kobo / ODK / JSON</option>
                      <option value="commcare">CommCare HQ</option>
                    </select>
                    {connType === "generic" ? (
                      <select
                        value={connFormat}
                        onChange={(e) => setConnFormat(e.target.value as "json" | "kobo" | "odk")}
                        className="rounded border border-border bg-background px-2 py-1.5"
                      >
                        <option value="kobo">Format Kobo</option>
                        <option value="odk">Format ODK</option>
                        <option value="json">JSON libre</option>
                      </select>
                    ) : (
                      <input
                        placeholder="URL endpoint (optionnel)"
                        value={connEndpoint}
                        onChange={(e) => setConnEndpoint(e.target.value)}
                        className="rounded border border-border bg-background px-2.5 py-1.5"
                      />
                    )}
                    <button
                      type="submit"
                      className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                    >
                      Enregistrer
                    </button>
                  </form>
                )}

                {showJsonForm && (
                  <form
                    onSubmit={handleJsonIngest}
                    className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs"
                  >
                    <textarea
                      rows={5}
                      value={jsonText}
                      onChange={(e) => setJsonText(e.target.value)}
                      className="w-full rounded border border-border bg-background p-2 font-mono text-[11px]"
                    />
                    <button
                      type="submit"
                      className="rounded bg-foreground px-3 py-1.5 font-medium text-background"
                    >
                      Ingérer les soumissions JSON
                    </button>
                  </form>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {sources.map((src) => (
                    <div
                      key={src.id}
                      className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">{src.name}</span>
                        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px]">
                          {src.status}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {src.type.toUpperCase()}
                        {src.format ? ` (${src.format})` : ""} · {src.recordsCount} ligne(s)
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={handleUpload}
                className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm"
              >
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet size={16} className="text-primary" />
                  Importer CSV / Excel
                </h2>
                <p className="text-xs text-muted-foreground">
                  Détection automatique encodage/séparateur et conservation du brut immuable.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.txt"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder='Mapping JSON optionnel (ex: {"nom":"fullName"})'
                  value={mappingText}
                  onChange={(e) => setMappingText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px]"
                />
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {uploading ? "Import & analyse…" : "Importer et contrôler"}
                </button>
              </form>
            </section>

            {/* Runs & Anomalies */}
            {loading ? (
              <p className="text-xs text-muted-foreground">Chargement…</p>
            ) : (
              <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <h2 className="text-sm font-semibold">Derniers runs ({runs.length})</h2>
                  {runs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun run enregistré.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
                      {runs.map((r) => (
                        <div key={r.id} className="rounded-lg border border-border p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{r.id}</span>
                            <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px]">
                              {r.status}
                            </span>
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            Déclencheur : {r.trigger} · Auto : {r.autoActionsCount} · Validation :{" "}
                            {r.pendingValidationsCount}
                          </div>
                          {r.summaryText && <p className="text-foreground">{r.summaryText}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">
                      Anomalies ({filteredAnomalies.length})
                    </h2>
                    <div className="flex gap-1">
                      {(["all", "bloquante", "a_verifier", "mineure"] as const).map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setSeverityFilter(sev)}
                          className={`rounded px-2 py-1 text-[11px] font-medium ${
                            severityFilter === sev
                              ? "bg-foreground text-background"
                              : "border border-border text-muted-foreground"
                          }`}
                        >
                          {sev === "all" ? "Toutes" : sev}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAnomalies.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-600">
                      <CheckCircle2 size={14} /> Aucune anomalie pour ce filtre.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto">
                      {filteredAnomalies.map((a) => (
                        <div key={a.id} className="rounded-lg border border-border p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                            <span className="font-semibold">{a.severity}</span>
                            <span className="text-muted-foreground">
                              {a.ruleId} · {a.status}
                            </span>
                          </div>
                          <p className="text-foreground">{a.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "records" && (
          <section className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
            <h2 className="text-sm font-semibold">
              Enregistrements normalisés (aucune suppression physique)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">ID externe</th>
                    <th className="py-2 pr-3">Nom complet</th>
                    <th className="py-2 pr-3">Téléphone</th>
                    <th className="py-2 pr-3">Âge</th>
                    <th className="py-2 pr-3">GPS / Zone</th>
                    <th className="py-2">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {records.slice(0, 100).map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                        {rec.externalId}
                      </td>
                      <td className="py-2 pr-3 font-medium">{rec.fullName || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">{rec.phone || "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">{rec.age ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        {rec.zone || "—"}
                        {rec.latitude !== null && rec.longitude !== null
                          ? ` (${rec.latitude.toFixed(3)}, ${rec.longitude.toFixed(3)})`
                          : ""}
                      </td>
                      <td className="py-2 font-mono text-[11px]">{rec.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "rules" && (
          <section className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Configuration YAML des règles du projet</h2>
                <p className="text-xs text-muted-foreground">
                  Champs obligatoires, plages, déduplication et zones d&apos;intervention GPS (`geoBounds.interventionZones`).
                </p>
              </div>
              <button
                onClick={() => void handleSaveRules()}
                disabled={savingRules}
                className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {savingRules ? "Enregistrement…" : "Valider et enregistrer"}
              </button>
            </div>
            <textarea
              rows={20}
              value={yamlDraft}
              onChange={(e) => setYamlDraft(e.target.value)}
              className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
            />
          </section>
        )}
      </main>
    </div>
  );
}
