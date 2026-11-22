"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, RefreshCw, ShieldCheck, X } from "lucide-react";
import { CardsListSkeleton } from "@/components/Skeletons";
import { SpaceHeader } from "@/components/SpaceHeader";
import { ToastBanner, type BannerMessage } from "@/components/ToastBanner";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type ValidationItem,
} from "@/lib/api";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function ValidationsPage() {
  const router = useRouter();
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const encodedSpaceId = encodeURIComponent(spaceId);

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerMessage | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const res = await guardianApi.getValidations(spaceId);
      setItems(res.validations || []);
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

  async function handleDecide(validationId: string, decision: "approved" | "rejected") {
    setBusyId(validationId);
    setBanner(null);
    try {
      await guardianApi.decideValidation(spaceId, validationId, decision);
      await refresh();
      setBanner({
        kind: "ok",
        text:
          decision === "approved"
            ? "Décision approuvée et journalisée avec possibilité de rollback."
            : "Décision rejetée ; l'enregistrement reste inchangé et les métriques d'apprentissage ont été mises à jour.",
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((v) => v.status === filter);
  }, [filter, items]);

  const pendingCount = items.filter((v) => v.status === "pending").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="validations"
        title={`File de Validations Humaines — ${spaceId}`}
        subtitle="Contrôle des fusions de doublons, archivages et alertes critiques avant écriture définitive."
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Actualiser les validations"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <ToastBanner banner={banner} onDismiss={() => setBanner(null)} />

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck size={15} className="text-primary" />
            <span>
              {pendingCount} validation(s) en attente sur {items.length} dossier(s)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: "all", label: "Toutes" },
                { key: "pending", label: "En attente" },
                { key: "approved", label: "Approuvées" },
                { key: "rejected", label: "Rejetées" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === opt.key
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading && items.length === 0 ? (
          <CardsListSkeleton count={3} />
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3 shadow-sm">
            <p className="text-xs text-muted-foreground">
              Aucun dossier de validation pour ce filtre.
            </p>
            <Link
              href={`/dashboard/${encodedSpaceId}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <ArrowLeft size={13} /> Retourner au pilotage qualité &amp; déclenchement Agent
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground text-sm">{item.title}</span>
                    <span className="font-mono text-[11px] text-primary">{item.actionType}</span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      Confiance {(item.confidence * 100).toFixed(0)} %
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Principal : {item.primaryRecordId}
                    {item.secondaryRecordId ? ` · Secondaire : ${item.secondaryRecordId}` : ""} ·
                    Statut : {item.status}
                    {item.decidedBy ? ` (${item.decidedBy})` : ""}
                  </p>
                </div>

                {item.status === "pending" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleDecide(item.id, "approved")}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      <Check size={13} /> Approuver
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleDecide(item.id, "rejected")}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <X size={13} /> Rejeter
                    </button>
                  </div>
                ) : (
                  <span
                    className={`font-mono text-xs font-semibold shrink-0 ${
                      item.status === "approved"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {item.status === "approved" ? "APPROUVÉ" : "REJETÉ"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
