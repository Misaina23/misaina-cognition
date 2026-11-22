"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { guardianApi, type Anomaly, type DataRun } from "../../../lib/api";

export default function DashboardSpacePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [runs, setRuns] = useState<DataRun[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!spaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await guardianApi.getRuns(spaceId);
      setRuns(data.runs || []);
      setAnomalies(data.anomalies || []);
    } catch {
      setError("Impossible de charger les runs de cet espace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  const latest = runs[0];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Espace {spaceId} — Runs, Doublons & Anomalies</h1>
          <p className="text-sm text-slate-600">
            Tableau de bord autonome : contrôle déterministe, détection GPS/zone et actions réversibles.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/${spaceId}/validations`} className="rounded border px-3 py-1.5 text-xs">
            Validations
          </Link>
          <Link href={`/dashboard/${spaceId}/historique`} className="rounded border px-3 py-1.5 text-xs">
            Historique
          </Link>
          <button
            onClick={async () => {
              await guardianApi.triggerRun(spaceId);
              await refresh();
            }}
            className="rounded bg-slate-900 px-3 py-1.5 text-xs text-white"
          >
            Lancer un contrôle
          </button>
        </div>
      </header>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-slate-500">Enregistrements traités (dernier run)</div>
          <div className="text-2xl font-bold">{latest?.recordsProcessed ?? 0}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-slate-500">Doublons trouvés</div>
          <div className="text-2xl font-bold">{latest?.duplicatesFound ?? 0}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-slate-500">Anomalies actives</div>
          <div className="text-2xl font-bold">{anomalies.length}</div>
        </div>
      </section>

      {loading ? (
        <p className="text-xs text-slate-500">Chargement…</p>
      ) : (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Derniers runs</h2>
            {runs.map((r) => (
              <div key={r.id} className="rounded border p-2.5 text-xs space-y-1">
                <div className="font-mono font-semibold">{r.id} — {r.status}</div>
                <div>Auto: {r.autoActionsCount} · Validation: {r.pendingValidationsCount}</div>
                {r.summaryText && <p className="text-slate-600">{r.summaryText}</p>}
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Anomalies détectées</h2>
            {anomalies.map((a) => (
              <div key={a.id} className="rounded border p-2.5 text-xs space-y-1">
                <div className="font-mono">{a.severity} · {a.ruleId} · {a.status}</div>
                <p>{a.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
