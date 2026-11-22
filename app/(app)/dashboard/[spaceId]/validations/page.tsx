"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, History, LayoutDashboard, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import type { ValidationItem } from "@/lib/guardian/types";

export default function SpaceValidationsPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const qc = useQueryClient();

  const validationsQuery = useQuery<{ validations: ValidationItem[] }>({
    queryKey: ["space-validations", spaceId],
    enabled: Boolean(spaceId),
    queryFn: () =>
      api.get("/guardian/validations", { params: { spaceId } }).then((r) => r.data),
  });

  const decideMutation = useMutation({
    mutationFn: ({
      validationId,
      decision,
    }: {
      validationId: string;
      decision: "approved" | "rejected";
    }) => api.post("/guardian/validations", { spaceId, validationId, decision }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-validations", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-runs", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-actions", spaceId] });
    },
  });

  const items = validationsQuery.data?.validations ?? [];

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href={`/dashboard/${encodeURIComponent(spaceId)}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ArrowLeft size={13} /> Espace {spaceId}
            </Link>
            <span>/</span>
            <span className="text-foreground">Validations</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            File de validation humaine — {spaceId}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}`}>
            <Button variant="outline" size="sm">
              <LayoutDashboard size={14} /> Vue espace
            </Button>
          </Link>
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}/historique`}>
            <Button variant="outline" size="sm">
              <History size={14} /> Historique
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Propositions en attente et traitées</CardTitle>
          <CardDescription>
            Arbitrage humain pour les quasi-doublons ambigus, anomalies bloquantes et écarts GPS vs zone d&apos;intervention.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Aucune demande de validation pour cet espace.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        item.status === "pending"
                          ? "warning"
                          : item.status === "approved"
                            ? "success"
                            : "default"
                      }
                    >
                      {item.status}
                    </Badge>
                    <span className="text-xs font-semibold text-foreground">{item.title}</span>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Confiance {(item.confidence * 100).toFixed(0)} %
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Run: {item.runId} · Enr. {item.primaryRecordId}
                    {item.secondaryRecordId ? ` ↔ ${item.secondaryRecordId}` : ""}
                  </p>
                </div>

                {item.status === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() =>
                        decideMutation.mutate({ validationId: item.id, decision: "approved" })
                      }
                      disabled={decideMutation.isPending}
                    >
                      <CheckCircle2 size={14} /> Valider
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        decideMutation.mutate({ validationId: item.id, decision: "rejected" })
                      }
                      disabled={decideMutation.isPending}
                    >
                      <XCircle size={14} /> Rejeter
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
