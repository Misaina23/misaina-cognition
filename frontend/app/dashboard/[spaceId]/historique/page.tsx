"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import { guardianApi, type AgentAction } from "@/lib/api";

export default function SpaceHistoriquePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const data = await guardianApi.getActions(spaceId);
      setActions(data.actions || []);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleRollback(actionId: string) {
    setBusyId(actionId);
    setBanner(null);
    try {
      await guardianApi.rollbackAction(spaceId, actionId);
      await refresh();
      setBanner("Action annulée : l'état antérieur des enregistrements a été restauré.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="historique"
        title={`Historique agent_actions — ${spaceId}`}
        subtitle="Traçabilité complète et annulation réversible en un clic sans suppression physique."
        actions={
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={13} /> Actualiser
          </button>
        }
      />

      <main className="mx-auto max-w-6xl space-y-4 px-6 py-6">
        {banner && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
            {banner}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          {loading ? (
            <p className="text-xs text-muted-foreground">Chargement…</p>
          ) : actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune action journalisée dans cet espace.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Horodatage</th>
                    <th className="py-2 pr-3">Run</th>
                    <th className="py-2 pr-3">Outil</th>
                    <th className="py-2 pr-3">Décision</th>
                    <th className="py-2 pr-3">Confiance</th>
                    <th className="py-2 pr-3">Auteur</th>
                    <th className="py-2 text-right">Rollback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {actions.map((act) => (
                    <tr key={act.id} className="align-top">
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(act.timestamp).toLocaleString("fr-FR")}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {act.runId}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-medium whitespace-nowrap">
                        {act.toolName}
                      </td>
                      <td className="py-2.5 pr-3 max-w-md">{act.decision}</td>
                      <td className="py-2.5 pr-3 font-mono">
                        {(act.confidence * 100).toFixed(0)} %
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className="rounded border border-border px-2 py-0.5 text-[11px]">
                          {act.author === "agent" ? "Agent" : "Humain"}
                        </span>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {act.reversible && !act.reverted ? (
                          <button
                            onClick={() => void handleRollback(act.id)}
                            disabled={busyId === act.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
                          >
                            <Undo2 size={12} /> Annuler
                          </button>
                        ) : act.reverted ? (
                          <span className="text-[11px] text-muted-foreground">Annulée</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
