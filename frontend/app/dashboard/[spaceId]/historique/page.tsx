"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Undo2 } from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import { guardianApi, isUnauthorizedError, type AgentAction } from "@/lib/api";

export default function SpaceHistoriquePage() {
  const router = useRouter();
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
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
      }
    } finally {
      setLoading(false);
    }
  }, [router, spaceId]);

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
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
      }
    } finally {
      setBusyId(null);
    }
  }

  const llmActions = actions.filter((a) => Boolean(a.llmProvider));
  const totalLlmTokens = llmActions.reduce((acc, a) => acc + (a.tokensUsed || 0), 0);

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

        {!loading && llmActions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-xs shadow-sm">
            <span className="font-medium text-foreground">
              Journalisation LLM dans <code className="font-mono">agent_actions</code>
            </span>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
              <span>{llmActions.length} appel(s) LLM</span>
              <span>{totalLlmTokens.toLocaleString("fr-FR")} tokens cumulés</span>
              <span>
                Dernier fournisseur :{" "}
                <strong className="text-primary">
                  {llmActions[0].llmProvider}/{llmActions[0].llmModel || "default"}
                </strong>
              </span>
            </div>
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
                  {actions.map((act) => {
                    const inTok =
                      act.inputTokens ??
                      (typeof act.output?.inputTokens === "number"
                        ? act.output.inputTokens
                        : undefined);
                    const outTok =
                      act.outputTokens ??
                      (typeof act.output?.outputTokens === "number"
                        ? act.output.outputTokens
                        : undefined);
                    return (
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
                        <td className="py-2.5 pr-3 max-w-md space-y-1">
                          <div>{act.decision}</div>
                          {act.llmProvider && (
                            <div className="font-mono text-[10px] text-primary">
                              {act.llmProvider}/{act.llmModel || "default"} · {act.tokensUsed ?? 0}{" "}
                              tok
                              {inTok !== undefined && outTok !== undefined
                                ? ` (${inTok} in / ${outTok} out)`
                                : ""}{" "}
                              · {act.durationMs ?? 0} ms
                            </div>
                          )}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
