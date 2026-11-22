"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { SpaceHeader } from "@/components/SpaceHeader";
import { guardianApi, type ValidationItem } from "@/lib/api";

export default function SpaceValidationsPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");

  const [items, setItems] = useState<ValidationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const data = await guardianApi.getValidations(spaceId);
      setItems(data.validations || []);
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDecide(validationId: string, decision: "approved" | "rejected") {
    setBusyId(validationId);
    setBanner(null);
    try {
      await guardianApi.decideValidation(spaceId, validationId, decision);
      await refresh();
      setBanner(
        decision === "approved"
          ? "Proposition validée et appliquée de manière réversible."
          : "Proposition rejetée ; aucune donnée modifiée."
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="validations"
        title={`Validations humaines — ${spaceId}`}
        subtitle="Arbitrage des quasi-doublons ambigus, anomalies bloquantes et incohérences GPS / zone d'intervention."
        actions={
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw size={13} /> Actualiser
          </button>
        }
      />

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-6">
        {banner && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700">
            {banner}
          </div>
        )}

        {loading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-xs text-muted-foreground">
            Aucune demande de validation pour cet espace.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-xs shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                        item.status === "pending"
                          ? "bg-amber-500/15 text-amber-700"
                          : item.status === "approved"
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="font-semibold text-foreground">{item.title}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      Confiance {(item.confidence * 100).toFixed(0)} % · {item.actionType}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{item.description}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Run: {item.runId} · Enr. {item.primaryRecordId}
                    {item.secondaryRecordId ? ` <-> ${item.secondaryRecordId}` : ""}
                  </p>
                </div>

                {item.status === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => void handleDecide(item.id, "approved")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                    >
                      <CheckCircle2 size={13} /> Valider
                    </button>
                    <button
                      onClick={() => void handleDecide(item.id, "rejected")}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-medium text-foreground disabled:opacity-50"
                    >
                      <XCircle size={13} /> Rejeter
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
