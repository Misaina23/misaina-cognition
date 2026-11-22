"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, RotateCcw } from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AgentAction,
} from "@/lib/api";

export default function HistoriquePage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const res = await guardianApi.getActions(spaceId);
      setActions(res.actions || []);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setLoading(false);
    }
  }, [router, spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRollback(actionId: string) {
    setRevertingId(actionId);
    setBanner(null);
    try {
      await guardianApi.rollbackAction(spaceId, actionId);
      await refresh();
      setBanner({
        kind: "ok",
        text: `Action ${actionId} annulée (rollback exécuté sur les enregistrements).`,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setRevertingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="historique"
        title={`Historique & Rollback — ${spaceId}`}
        subtitle="Traçabilité complète des actions agent/humain, observabilité LLM et restauration réversible en un clic."
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Actualiser l'historique"
          >
            <RefreshCw size={14} />
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {banner && (
          <div
            className={`rounded-xl border px-4 py-3 text-xs font-medium ${
              banner.kind === "err"
                ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {banner.text}
          </div>
        )}

        <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History size={16} className="text-primary" />
              Journal des actions ({actions.length})
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Chargement de l&apos;historique…</p>
          ) : actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune action enregistrée dans cet espace pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Horodatage</th>
                    <th className="py-2 pr-3">Outil / Action</th>
                    <th className="py-2 pr-3">Auteur</th>
                    <th className="py-2 pr-3">Décision</th>
                    <th className="py-2 pr-3">Modèle &amp; Tokens</th>
                    <th className="py-2 pr-3">État</th>
                    <th className="py-2 text-right">Réversibilité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {actions.map((act) => (
                    <tr key={act.id}>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(act.timestamp).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold text-[11px]">
                        {act.toolName}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] uppercase">
                        {act.author}
                      </td>
                      <td className="py-2.5 pr-3 text-foreground max-w-md">{act.decision}</td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground">
                        {act.llmProvider || "deterministic"} ({act.tokensUsed ?? 0} tok ·{" "}
                        {act.durationMs ?? 0} ms)
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px]">
                        {act.reverted ? (
                          <span className="text-amber-600 dark:text-amber-400">ANNULÉE</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">APPLIQUÉE</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        {act.reversible && !act.reverted ? (
                          <button
                            type="button"
                            disabled={revertingId === act.id}
                            onClick={() => void handleRollback(act.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            <RotateCcw size={12} />
                            {revertingId === act.id ? "Rollback…" : "Annuler (Rollback)"}
                          </button>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
