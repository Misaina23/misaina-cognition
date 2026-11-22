"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { describeApiError, guardianApi } from "@/lib/api";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [requestedRole, setRequestedRole] = useState<"COORDINATEUR" | "ANALYSTE" | "LECTEUR">(
    "ANALYSTE"
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedUser, setSubmittedUser] = useState<{
    fullName: string;
    email: string;
    department: string;
    role: string;
    message: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const res = await guardianApi.register({
        fullName: fullName.trim(),
        email: email.trim(),
        department: department.trim(),
        requestedRole,
        password,
      });
      setSubmittedUser({
        fullName: res.user.fullName,
        email: res.user.email,
        department: res.user.department,
        role: String(res.user.role),
        message: res.message,
      });
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12 space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} /> Retour à la connexion
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Accueil vitrine
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Misaina Cognition
              </p>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Demande de création de compte
              </h1>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pour protéger la confidentialité des données MEAL et des documents internes, toute
            nouvelle inscription reste en attente jusqu&apos;à validation manuelle par le Super
            Admin ou un administrateur.
          </p>
        </div>

        {submittedUser ? (
          <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-foreground">
                  Demande enregistrée (statut : en attente)
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {submittedUser.message}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/80 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nom complet</span>
                <span className="font-semibold text-foreground">{submittedUser.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="font-mono text-foreground">{submittedUser.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Organisation</span>
                <span className="text-foreground">{submittedUser.department}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Profil demandé</span>
                <span className="font-mono text-primary">{submittedUser.role}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
              <Clock size={13} className="shrink-0" />
              <span>
                La connexion restera bloquée tant que votre compte n&apos;aura pas été validé et
                assigné à un espace isolé.
              </span>
            </div>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <ShieldCheck size={14} /> Aller à la page de connexion
            </Link>
          </div>
        ) : (
          <>
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
                <label className="text-[11px] font-medium text-muted-foreground">
                  Nom complet
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="Ex. Rindra Rakoto"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Adresse email professionnelle
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="prenom.nom@organisation.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Organisation / Département
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ex. Mission Sahel MEAL"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Rôle demandé
                  </label>
                  <select
                    value={requestedRole}
                    onChange={(e) =>
                      setRequestedRole(e.target.value as "COORDINATEUR" | "ANALYSTE" | "LECTEUR")
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  >
                    <option value="LECTEUR">LECTEUR (Lecture seule)</option>
                    <option value="ANALYSTE">ANALYSTE (Import, Agent & Export)</option>
                    <option value="COORDINATEUR">COORDINATEUR (Validation & Règles)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Mot de passe (6 car. min.)
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mot de passe"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-xs outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Masquer" : "Afficher"}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirmation"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-xs outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPassword ? "Masquer" : "Afficher"}
                    >
                      {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                <UserPlus size={14} />
                {loading ? "Envoi de la demande…" : "Soumettre la demande de compte"}
              </button>
            </form>
          </>
        )}

        <div className="border-t border-border pt-4 flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
          <Lock size={13} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Aucun accès aux données bénéficiaires n&apos;est accordé à l&apos;inscription. Un
            administrateur valide votre profil et vos droits exacts avant la première connexion.
          </span>
        </div>
      </div>
    </main>
  );
}
