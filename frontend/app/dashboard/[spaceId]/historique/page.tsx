"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { guardianApi, type AgentAction } from "../../../../lib/api";

export default function SpaceHistoriquePage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const [actions, setActions] = useState<AgentAction[]>([]);

  async function refresh() {
    if (!spaceId) return;
    const data = await guardianApi.getActions(spaceId);
    setActions(data.actions || []);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-xl font-bold">Historique `agent_actions` — {spaceId}</h1>
        <div className="flex gap-2 text-xs">
          <Link href={`/dashboard/${spaceId}`} className="rounded border px-3 py-1.5">
            Dashboard
          </Link>
          <Link href={`/dashboard/${spaceId}/validations`} className="rounded border px-3 py-1.5">
            Validations
          </Link>
        </div>
      </header>

      <table className="w-full text-left text-xs">
        <thead className="border-b">
          <tr>
            <th className="py-2">Horodatage</th>
            <th className="py-2">Outil</th>
            <th className="py-2">Décision</th>
            <th className="py-2">Auteur</th>
            <th className="py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {actions.map((act) => (
            <tr key={act.id}>
              <td className="py-2 font-mono">{act.timestamp}</td>
              <td className="py-2 font-mono">{act.toolName}</td>
              <td className="py-2">{act.decision}</td>
              <td className="py-2">{act.author}</td>
              <td className="py-2 text-right">
                {act.reversible && !act.reverted ? (
                  <button
                    onClick={async () => {
                      await guardianApi.rollbackAction(spaceId, act.id);
                      await refresh();
                    }}
                    className="rounded border px-2.5 py-1"
                  >
                    Annuler
                  </button>
                ) : act.reverted ? (
                  <span className="text-slate-400">Annulée</span>
                ) : (
                  <span>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
