"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => setStatus(r.ok ? "ok" : "err"))
      .catch(() => setStatus("err"));
  }, [token]);

  return (
    <Card className="w-96 space-y-4 text-center">
      <h1 className="text-xl font-bold">Confirmation d'email</h1>
      {status === "loading" && <p>Vérification…</p>}
      {status === "ok" && <p className="text-green-500">Email confirmé avec succès !</p>}
      {status === "err" && <p className="text-red-500">Lien invalide ou expiré.</p>}
      <Link href="/login" className="text-primary hover:underline">Aller à la connexion</Link>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <Suspense fallback={<div>Chargement…</div>}>
        <VerifyInner />
      </Suspense>
    </div>
  );
}
