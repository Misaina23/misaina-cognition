"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderKanban, Plus, ShieldAlert, UserCheck } from "lucide-react";
import {
  getActiveUserId,
  guardianApi,
  setActiveUserId,
  type UserSpace,
} from "@/lib/api";

const PROFILES = [
  { id: "u-1", label: "Direction Exécutive (Admin)" },
  { id: "u-3", label: "Opérations Sahel - Dakar" },
];

export default function HomeSpacesPage() {
  const [userId, setUserId] = useState("u-1");
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  async function loadSpaces() {
    setLoading(true);
    setError(null);
    try {
      const data = await guardianApi.getSpaces();
      setSpaces(data.spaces || []);
    } catch {
      setError("Impossible de charger les espaces depuis le backend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setUserId(getActiveUserId());
    void loadSpaces();
  }, []);

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await guardianApi.createSpace(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      await loadSpaces();
    } catch {
      setError("Création de l'espace impossible.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldAlert size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Gardien de données autonome
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Sélectionnez un espace isolé pour inspecter les runs, anomalies GPS/zone, doublons et validations.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
          <UserCheck size={14} className="text-muted-foreground" />
          <select
            aria-label="Profil tenant"
            value={userId}
            onChange={(e) => {
              const next = e.target.value;
              setActiveUserId(next);
              setUserId(next);
              void loadSpaces();
            }}
            className="bg-transparent font-medium text-foreground outline-none"
          >
            {PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderKanban size={15} className="text-primary" />
            Espaces autorisés ({spaces.length})
          </h2>

          {loading ? (
            <p className="text-xs text-muted-foreground">Chargement des espaces…</p>
          ) : spaces.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun espace trouvé pour ce tenant.</p>
          ) : (
            <div className="space-y-3">
              {spaces.map((sp) => (
                <div
                  key={sp.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">{sp.name}</div>
                    <p className="text-xs text-muted-foreground">{sp.description || "Espace isolé"}</p>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {sp.tenantId} · {sp.id}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/${encodeURIComponent(sp.id)}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 shrink-0"
                  >
                    Ouvrir l&apos;espace
                    <ArrowRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleCreateSpace}
          className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm h-fit"
        >
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Plus size={15} className="text-primary" />
            Nouvel espace isolé
          </h2>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Nom de l&apos;espace</label>
            <input
              type="text"
              required
              placeholder="Ex. Enquête Santé Tambacounda"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              placeholder="Périmètre, zone ou partenaire"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="w-full rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
          >
            {creating ? "Création…" : "Créer l'espace"}
          </button>
        </form>
      </section>
    </main>
  );
}
