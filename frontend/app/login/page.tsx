"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { Button, Input, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  async function login() {
    setLoading(true); setErr("");
    try {
      const { data } = await authApi.login(email, password);
      setAuth(
        { id: data.userId, email: data.email, fullName: data.fullName, role: data.role, department: data.department },
        data.token, data.refreshToken
      );
      router.push("/dashboard");
    } catch {
      setErr("Identifiants invalides");
    } finally { setLoading(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-96 space-y-4">
        <div className="text-center">
          <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-primary" />
          <h1 className="text-xl font-bold">Misaina Cognition</h1>
          <p className="text-sm text-muted-foreground">Connexion à votre espace entreprise</p>
        </div>
        <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
        {err && <p className="text-sm text-red-500">{err}</p>}
        <Button className="w-full" onClick={login} disabled={loading}>{loading ? "…" : "Se connecter"}</Button>
        <div className="flex justify-between text-sm">
          <Link href="/register" className="text-primary hover:underline">Créer un compte</Link>
          <Link href="/forgot-password" className="text-muted-foreground hover:underline">Mot de passe oublié ?</Link>
        </div>
      </Card>
    </div>
  );
}
