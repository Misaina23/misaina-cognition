"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { Button, Input, Card } from "@/components/ui";
import { Layers, ShieldCheck, ArrowRight, UserCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  async function performLogin(loginEmail: string, loginPass: string) {
    setLoading(true);
    setErr("");
    try {
      const { data } = await authApi.login(loginEmail, loginPass);
      setAuth(
        {
          id: data.userId,
          email: data.email,
          fullName: data.fullName,
          role: data.role,
          department: data.department,
        },
        data.token,
        data.refreshToken
      );
      router.push("/dashboard");
    } catch {
      setErr("Identifiants invalides");
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin(role: "ADMIN" | "MANAGER" | "EMPLOYEE") {
    if (role === "ADMIN") {
      setEmail("admin@misaina.internal");
      setPassword("password123");
      performLogin("admin@misaina.internal", "password123");
    } else if (role === "MANAGER") {
      setEmail("marie.curie@misaina.internal");
      setPassword("password123");
      performLogin("marie.curie@misaina.internal", "password123");
    } else {
      setEmail("jean.dupont@misaina.internal");
      setPassword("password123");
      performLogin("jean.dupont@misaina.internal", "password123");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Layers size={24} className="stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Misaina Cognition</h1>
          <p className="text-xs text-muted-foreground">
            Moteur de recherche augmentée & intelligence documentaire d&apos;entreprise
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            performLogin(email, password);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Adresse Email</label>
            <Input
              type="email"
              placeholder="nom@misaina.internal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-muted-foreground">Mot de passe</label>
              <Link href="/forgot-password" className="text-primary hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
            <Input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && (
            <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-500 font-medium">
              {err}
            </div>
          )}

          <Button type="submit" className="w-full shadow-sm" disabled={loading}>
            {loading ? "Connexion en cours…" : "Se connecter"}
          </Button>
        </form>

        {/* Quick Demo Logins */}
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
            Accès démo rapide (1-clic)
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleDemoLogin("ADMIN")}
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center hover:border-primary hover:bg-muted/60 transition-all text-xs"
            >
              <span className="font-semibold text-foreground">Admin</span>
              <span className="text-[10px] text-muted-foreground">Direction</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin("MANAGER")}
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center hover:border-primary hover:bg-muted/60 transition-all text-xs"
            >
              <span className="font-semibold text-foreground">Manager</span>
              <span className="text-[10px] text-muted-foreground">R&D</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin("EMPLOYEE")}
              className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-2 text-center hover:border-primary hover:bg-muted/60 transition-all text-xs"
            >
              <span className="font-semibold text-foreground">Employé</span>
              <span className="text-[10px] text-muted-foreground">RH</span>
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground border-t border-border pt-4 flex flex-col items-center gap-2">
          <div>
            Nouveau collaborateur ?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline">
              Créer un compte
            </Link>
          </div>
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← Revenir au site vitrine public
          </Link>
        </div>
      </Card>
    </div>
  );
}
