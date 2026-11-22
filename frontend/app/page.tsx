"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, FolderKanban, LogOut, Plus, RefreshCw, ShieldAlert, UserCheck } from "lucide-react";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AuthUser,
  type UserSpace,
} from "@/lib/api";

export default function HomeSpacesPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const loadSessionAndSpaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await guardianApi.me();
      setUser(me.user);
      setSpaces(me.spaces || []);
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setError(`Impossible de vérifier la session ou de charger les espaces. (${describeApiError(err)})`);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadSessionAndSpaces();
  }, [loadSessionAndSpaces]);

  async function handleLogout() {
    await guardianApi.logout();
    router.replace("/login");
  }

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await guardianApi.createSpace(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      await loadSessionAndSpaces();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
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
              Plateforme MEAL autonome
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitoring, Evaluation, Accountability &amp; Learning — Sélectionnez un espace isolé pour piloter les collectes, anomalies GPS/zone, enquêteurs et validations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
                <UserCheck size={14} className="text-emerald-600" />
                <div>
                  <span className="font-medium text-foreground">{user.fullName}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    ({user.role})
                  </span>
                </div>
              </div>
              <button
                onClick={() => void handleLogout()}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <LogOut size={13} /> Déconnexion
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Se connecter
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700">
          <span>{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadSessionAndSpaces()}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-background px-2.5 py-1 font-medium text-red-700 hover:bg-red-500/10 disabled:opacity-50"
            >
              <RefreshCw size={12} /> Réessayer
            </button>
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg bg-primary px-2.5 py-1 font-medium text-primary-foreground"
            >
              Connexion
            </Link>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderKanban size={15} className="text-primary" />
            Espaces autorisés ({spaces.length})
          </h2>

          {loading ? (
            <p className="text-xs text-muted-foreground">Chargement de la session et des espaces…</p>
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
