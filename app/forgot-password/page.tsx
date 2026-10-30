"use client";
import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";
import { Layers, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await authApi.forgot(email);
      setSent(true);
    } catch {
      setErr("Une erreur est survenue lors de l'envoi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Layers size={24} className="stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Mot de passe oublié</h1>
          <p className="text-xs text-muted-foreground">
            Entrez votre adresse email pour recevoir un lien de réinitialisation sécurisé.
          </p>
        </div>

        <form onSubmit={handleSend} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Adresse Email</label>
            <Input
              required
              type="email"
              placeholder="nom@misaina.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {sent && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Si le compte existe, un lien de réinitialisation a été transmis.</span>
            </div>
          )}

          {err && <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-500">{err}</div>}

          <Button type="submit" className="w-full shadow-sm" disabled={loading}>
            {loading ? "Envoi en cours…" : "Envoyer le lien de réinitialisation"}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
            <ArrowLeft size={13} /> Retour à la connexion
          </Link>
        </div>
      </Card>
    </div>
  );
}
