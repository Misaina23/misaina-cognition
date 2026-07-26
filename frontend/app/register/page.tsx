"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";

export default function RegisterPage() {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", department: "General", role: "EMPLOYEE" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function set(k: keyof typeof form, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function register() {
    setLoading(true); setErr("");
    try {
      await authApi.register(form);
      setOk(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Échec de l'inscription");
    } finally { setLoading(false); }
  }

  if (ok) return <div className="flex min-h-screen items-center justify-center">Compte créé ! Redirection…</div>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-96 space-y-4">
        <h1 className="text-xl font-bold text-center">Créer un compte</h1>
        <Input placeholder="Nom complet" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} />
        <Input placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <Input type="password" placeholder="Mot de passe (min 6)" value={form.password} onChange={(e) => set("password", e.target.value)} />
        <Input placeholder="Département" value={form.department} onChange={(e) => set("department", e.target.value)} />
        <Button className="w-full" onClick={register} disabled={loading}>{loading ? "…" : "S'inscrire"}</Button>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Déjà un compte ? Se connecter</Link></p>
      </Card>
    </div>
  );
}
