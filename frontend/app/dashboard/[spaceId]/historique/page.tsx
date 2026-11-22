"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  History,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeleton } from "@/components/Skeletons";
import { SpaceHeader } from "@/components/SpaceHeader";
import { ToastBanner, type BannerMessage } from "@/components/ToastBanner";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AgentAction,
} from "@/lib/api";

const PAGE_SIZE = 25;

export default function HistoriquePage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<AgentAction | null>(null);
  const [banner, setBanner] = useState<BannerMessage | null>(null);

  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<"all" | "agent" | "human">("all");
  const [stateFilter, setStateFilter] = useState<"all" | "reversible" | "reverted">("all");
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    setPage(1);
  }, [search, authorFilter, stateFilter]);

  async function handleRollback(actionId: string) {
    setRevertingId(actionId);
    setBanner(null);
    try {
      await guardianApi.rollbackAction(spaceId, actionId);
      setConfirmAction(null);
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

  const filteredActions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return actions.filter((act) => {
      if (authorFilter !== "all" && act.author !== authorFilter) return false;
      if (stateFilter === "reversible" && (!act.reversible || act.reverted)) return false;
      if (stateFilter === "reverted" && !act.reverted) return false;
      if (!q) return true;
      return (
        act.toolName.toLowerCase().includes(q) ||
        act.decision.toLowerCase().includes(q) ||
        (act.llmProvider || "").toLowerCase().includes(q)
      );
    });
  }, [actions, authorFilter, search, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredActions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedActions = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredActions.slice(start, start + PAGE_SIZE);
  }, [filteredActions, safePage]);

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
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <ToastBanner banner={banner} onDismiss={() => setBanner(null)} />

        <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History size={16} className="text-primary" />
              Journal des actions ({filteredActions.length} / {actions.length})
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher outil, décision…"
                  className="rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
                />
              </div>
              <select
                aria-label="Filtrer par auteur"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value as "all" | "agent" | "human")}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="all">Tous auteurs</option>
                <option value="agent">Agent IA</option>
                <option value="human">Humain</option>
              </select>
              <select
                aria-label="Filtrer par réversibilité"
                value={stateFilter}
                onChange={(e) =>
                  setStateFilter(e.target.value as "all" | "reversible" | "reverted")
                }
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
              >
                <option value="all">Tous états</option>
                <option value="reversible">Réversibles actives</option>
                <option value="reverted">Annulées (Rollback)</option>
              </select>
            </div>
          </div>

          {loading && actions.length === 0 ? (
            <TableSkeleton rows={6} columns={6} />
          ) : paginatedActions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Aucune action enregistrée correspondant à ces filtres.
            </p>
          ) : (
            <>
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
                    {paginatedActions.map((act) => (
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
                        <td className="py-2.5 pr-3 font-mono text-[11px] text-muted-foreground tabular-nums">
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
                        <td className="py-2.5 text-right whitespace-nowrap">
                          {act.reversible && !act.reverted ? (
                            <button
                              type="button"
                              disabled={revertingId === act.id}
                              onClick={() => setConfirmAction(act)}
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    Page {safePage} / {totalPages} · {filteredActions.length} entrée(s)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                    >
                      <ChevronLeft size={13} /> Précédent
                    </button>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                    >
                      Suivant <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title="Confirmer le rollback de cette action ?"
        description={
          confirmAction
            ? `Action "${confirmAction.toolName}" (${confirmAction.decision}). Les enregistrements affectés retrouveront leur état antérieur et cette annulation sera tracée.`
            : ""
        }
        confirmLabel="Confirmer le rollback"
        variant="warning"
        busy={Boolean(revertingId)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction) {
            return handleRollback(confirmAction.id);
          }
        }}
      />
    </div>
  );
}
