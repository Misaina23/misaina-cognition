"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserPlus } from "lucide-react";
import { useSession } from "@/components/SessionProvider";
import { describeApiError, guardianApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { refreshSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await guardianApi.login(email.trim(), password);
      await refreshSession();
      const firstSpaceId = res.spaces?.[0]?.id;
      router.replace(firstSpaceId ? `/dashboard/${encodeURIComponent(firstSpaceId)}` : "/workspace");
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12 space-y-4">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> Retour à l&apos;accueil vitrine
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Misaina Cognition
              </p>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Connexion sécurisée
              </h1>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Authentification obligatoire pour consulter les données MEAL, exécuter l&apos;agent IA
            ou exporter des rapports (.csv / .docx).
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="login-email" className="text-[11px] font-medium text-muted-foreground">
              Adresse email professionnelle
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="nom@organisation.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="login-password"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Saisir votre mot de passe"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-xs outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={
                  showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                }
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            <KeyRound size={14} />
            {loading ? "Vérification…" : "Ouvrir une session signée"}
          </button>
        </form>

        <div className="flex items-center justify-between rounded-xl border border-border bg-background/70 px-3.5 py-2.5 text-xs">
          <span className="text-muted-foreground">Nouveau collaborateur ?</span>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            <UserPlus size={13} /> Demander un compte
          </Link>
        </div>

        <div className="border-t border-border pt-4 flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
          <Lock size={13} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Aucune donnée bénéficiaire, soumission terrain ni rapport n&apos;est accessible sans
            session signée (cookie HttpOnly + isolation stricte par tenant).
          </span>
        </div>
      </div>
    </main>
  );
}
