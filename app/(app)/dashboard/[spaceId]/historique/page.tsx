"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LayoutDashboard, ShieldCheck, Undo2 } from "lucide-react";
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
import type { AgentAction } from "@/lib/guardian/types";

export default function SpaceHistoriquePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const qc = useQueryClient();

  const actionsQuery = useQuery<{ actions: AgentAction[] }>({
    queryKey: ["space-actions", spaceId],
    enabled: Boolean(spaceId),
    queryFn: () => api.get("/guardian/actions", { params: { spaceId } }).then((r) => r.data),
  });

  const rollbackMutation = useMutation({
    mutationFn: (actionId: string) => api.post("/guardian/actions", { spaceId, actionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-actions", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-records", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-runs", spaceId] });
    },
  });

  const actions = actionsQuery.data?.actions ?? [];

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
            <span className="text-foreground">Historique agent_actions</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Historique des actions — {spaceId}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}`}>
            <Button variant="outline" size="sm">
              <LayoutDashboard size={14} /> Vue espace
            </Button>
          </Link>
          <Link href={`/dashboard/${encodeURIComponent(spaceId)}/validations`}>
            <Button variant="outline" size="sm">
              <ShieldCheck size={14} /> Validations
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal `agent_actions`</CardTitle>
          <CardDescription>
            Toutes les actions automatiques ou humaines sont tracées et annulables sans perte de données.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Aucune action enregistrée dans cet espace.
            </p>
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
                        <Badge variant={act.author === "agent" ? "outline" : "default"}>
                          {act.author === "agent" ? "Agent" : "Humain"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {act.reversible && !act.reverted ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            onClick={() => rollbackMutation.mutate(act.id)}
                            disabled={rollbackMutation.isPending}
                          >
                            <Undo2 size={12} /> Annuler
                          </Button>
                        ) : act.reverted ? (
                          <Badge variant="default">Annulée</Badge>
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
        </CardContent>
      </Card>
    </div>
  );
}
