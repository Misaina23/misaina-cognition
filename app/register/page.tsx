"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";
import { Layers, CheckCircle2 } from "lucide-react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    department: "R&D",
    role: "EMPLOYEE",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    try {
      await authApi.register(form);
      setOk(true);
      setTimeout(() => router.push("/login"), 1200);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Échec de l'inscription");
    } finally {
      setLoading(false);
    }
  }

  if (ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <CheckCircle2 size={24} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Compte créé avec succès !</h2>
          <p className="text-xs text-muted-foreground">
            Redirection vers la page de connexion…
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Layers size={24} className="stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Créer un compte</h1>
          <p className="text-xs text-muted-foreground">Rejoignez l&apos;espace Misaina Cognition</p>
        </div>

        <form onSubmit={register} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Nom complet</label>
            <Input
              required
              placeholder="Ex: Alice Bertrand"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Adresse Email professionnelle</label>
            <Input
              required
              type="email"
              placeholder="alice.bertrand@misaina.internal"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Mot de passe (min. 6 caractères)</label>
            <Input
              required
              type="password"
              placeholder="••••••••••••"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Département</label>
            <Input
              required
              placeholder="Ex: R&D, RH, Sécurité, Direction"
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
            />
          </div>

          {err && (
            <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-500 font-medium">
              {err}
            </div>
          )}

          <Button type="submit" className="w-full shadow-sm" disabled={loading}>
            {loading ? "Création en cours…" : "S'inscrire"}
          </Button>
        </form>

        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Se connecter
          </Link>
        </div>
      </Card>
    </div>
  );
}
