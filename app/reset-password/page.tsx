"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";
import { Layers, CheckCircle2, ArrowLeft } from "lucide-react";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (password.length < 6) {
      setErr("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.reset(token, password);
      setMsg(data.message || "Mot de passe réinitialisé avec succès !");
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Échec de réinitialisation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md p-8 shadow-xl border-border space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
          <Layers size={24} className="stroke-[2.2]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Nouveau mot de passe
        </h1>
        <p className="text-xs text-muted-foreground">
          Définissez un mot de passe robuste conforme aux critères de sécurité.
        </p>
      </div>

      <form onSubmit={handleReset} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Nouveau mot de passe</label>
          <Input
            required
            type="password"
            placeholder="Min. 6 caractères"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Confirmer le mot de passe</label>
          <Input
            required
            type="password"
            placeholder="Répétez le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {msg && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {err && <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-500">{err}</div>}

        <Button type="submit" className="w-full shadow-sm" disabled={loading}>
          {loading ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
        </Button>
      </form>

      <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
        <Link href="/login" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
          <ArrowLeft size={13} /> Retour à la connexion
        </Link>
      </div>
    </Card>
  );
}

export default function ResetPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Chargement…</div>}>
        <ResetInner />
      </Suspense>
    </div>
  );
}
