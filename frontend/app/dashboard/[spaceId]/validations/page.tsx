"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { guardianApi, type ValidationItem } from "../../../../lib/api";

export default function SpaceValidationsPage() {
  const params = useParams<{ spaceId: string }>();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const [items, setItems] = useState<ValidationItem[]>([]);

  async function refresh() {
    if (!spaceId) return;
    const data = await guardianApi.getValidations(spaceId);
    setItems(data.validations || []);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-xl font-bold">Validations en attente — {spaceId}</h1>
        <div className="flex gap-2 text-xs">
          <Link href={`/dashboard/${spaceId}`} className="rounded border px-3 py-1.5">
            Dashboard
          </Link>
          <Link href={`/dashboard/${spaceId}/historique`} className="rounded border px-3 py-1.5">
            Historique
          </Link>
        </div>
      </header>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune demande de validation.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-4 text-xs">
              <div className="space-y-1">
                <div className="font-semibold">
                  [{item.status}] {item.title}
                </div>
                <p className="text-slate-600">{item.description}</p>
              </div>
              {item.status === "pending" && (
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      await guardianApi.decideValidation(spaceId, item.id, "approved");
                      await refresh();
                    }}
                    className="rounded bg-emerald-600 px-3 py-1.5 text-white"
                  >
                    Valider
                  </button>
                  <button
                    onClick={async () => {
                      await guardianApi.decideValidation(spaceId, item.id, "rejected");
                      await refresh();
                    }}
                    className="rounded border px-3 py-1.5"
                  >
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
