"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function reset() {
    setMsg(""); setErr("");
    try {
      const { data } = await authApi.reset(token, password);
      setMsg(data.message);
      setTimeout(() => router.push("/login"), 1500);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Échec");
    }
  }

  return (
    <Card className="w-96 space-y-4">
      <h1 className="text-xl font-bold text-center">Réinitialiser le mot de passe</h1>
      <Input type="password" placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
      {msg && <p className="text-sm text-green-500">{msg}</p>}
      {err && <p className="text-sm text-red-500">{err}</p>}
      <Button className="w-full" onClick={reset}>Réinitialiser</Button>
      <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Connexion</Link></p>
    </Card>
  );
}

export default function ResetPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <Suspense fallback={<div>Chargement…</div>}>
        <ResetInner />
      </Suspense>
    </div>
  );
}
