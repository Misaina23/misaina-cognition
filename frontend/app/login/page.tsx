"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, KeyRound, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { guardianApi } from "@/lib/api";

const DEMO_ACCOUNTS = [
  {
    label: "Direction Exécutive (Admin)",
    email: "dir.exec@misaina-corp.org",
    hint: "DirExec2026!",
  },
  {
    label: "Opérations Sahel - Dakar",
    email: "a.traore@misaina-corp.org",
    hint: "SahelOps2026!",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await guardianApi.login(email.trim(), password);
      router.replace("/workspace");
    } catch {
      setError("Identifiants invalides ou session refusée par le serveur.");
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
            Session signée par jeton JWT HS256 et cookie HttpOnly avec isolation stricte par tenant.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Adresse email professionnelle
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Mot de passe</label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Saisir votre mot de passe"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-8 text-xs outline-none focus:border-primary"
              />
              <Lock size={13} className="absolute right-3 top-2.5 text-muted-foreground" />
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

        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <UserCheck size={13} /> Comptes tenants de démonstration (pré-remplissage)
          </div>
          <div className="grid grid-cols-1 gap-2">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setEmail(acc.email);
                  setPassword(acc.hint);
                }}
                className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-left text-[11px] hover:bg-muted transition-colors"
              >
                <div>
                  <div className="font-medium text-foreground">{acc.label}</div>
                  <div className="font-mono text-muted-foreground">{acc.email}</div>
                </div>
                <span className="font-mono text-[10px] text-primary">Pré-remplir</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
