"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Bot,
  ExternalLink,
  FolderPlus,
  Lock,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { useSession } from "@/components/SessionProvider";
import { KpiStripSkeleton } from "@/components/Skeletons";
import { describeApiError, guardianApi, isUnauthorizedError } from "@/lib/api";

export default function WorkspaceHubPage() {
  return (
    <AuthGuard>
      <WorkspaceHubContent />
    </AuthGuard>
  );
}

function WorkspaceHubContent() {
  const router = useRouter();
  const { user, spaces, loading, isDark, toggleTheme, refreshSession, clearSession } = useSession();
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateSpace(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await guardianApi.createSpace(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await refreshSession();
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      setError(describeApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    try {
      await guardianApi.logout();
    } finally {
      clearSession();
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-foreground">
                Misaina Cognition — Espaces Souverains
              </h1>
              <p className="text-xs text-muted-foreground">
                Cloisonnement multitenant SecNumCloud · Moteur RAG BM25 &amp; Contrôle Qualité MEAL
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              <ExternalLink size={13} /> Site vitrine
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Basculer le thème clair/sombre"
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut size={13} /> Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {user && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Session Authentifiée
              </p>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {user.fullName}
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {user.email} · Rôle : {user.role} · Direction : {user.department}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              <FolderPlus size={14} /> Nouvel espace isolé
            </button>
          </section>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {showCreate && (
          <form
            onSubmit={handleCreateSpace}
            className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-foreground">
              Créer un périmètre documentaire et MEAL cloisonné
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Nom de l&apos;espace
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex. Direction Juridique Groupe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Description / Périmètre PSSI
                </label>
                <input
                  type="text"
                  placeholder="Ex. Contrats cadres, conformité PSSI et rapports audit"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {creating ? "Création…" : "Créer l'espace"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <KpiStripSkeleton count={2} />
        ) : spaces.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            Aucun espace isolé associé à ce compte pour le moment.
          </div>
        ) : (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {spaces.map((space) => {
              const encoded = encodeURIComponent(space.id);
              return (
                <div
                  key={space.id}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 font-mono text-primary">
                        <Lock size={12} /> {space.tenantId}
                      </span>
                      <span className="font-mono">{space.id}</span>
                    </div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      {space.name}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {space.description || "Périmètre multitenant cloisonné SecNumCloud et PSSI."}
                    </p>
                  </div>

                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                      <span>Membres autorisés : {space.memberUserIds.length}</span>
                      <span>Créé le {new Date(space.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Link
                        href={`/dashboard/${encoded}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                      >
                        <Bot size={14} />
                        Ouvrir Agent IA &amp; Contrôle
                        <ArrowRight size={13} />
                      </Link>
                      <Link
                        href={`/dashboard/${encoded}/knowledge`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                      >
                        <BookOpenCheck size={14} />
                        Ouvrir Base RAG Souveraine
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
