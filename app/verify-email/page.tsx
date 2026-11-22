"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { Layers, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

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
    <Card className="w-full max-w-md p-8 shadow-xl border-border space-y-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
        <Layers size={24} className="stroke-[2.2]" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Confirmation d&apos;email
        </h1>
        <p className="text-xs text-muted-foreground">Validation de votre adresse professionnelle</p>
      </div>

      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Vérification du certificat de validation…</span>
        </div>
      )}

      {status === "ok" && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-emerald-500/10 p-4 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={24} />
          <span className="font-semibold text-sm">Votre email a été confirmé avec succès !</span>
          <span>Votre compte dispose désormais des accès complets.</span>
        </div>
      )}

      {status === "err" && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-red-500/10 p-4 text-xs text-red-500">
          <AlertCircle size={24} />
          <span className="font-semibold text-sm">Lien invalide ou expiré</span>
          <span>Veuillez demander un nouveau lien ou vous connecter.</span>
        </div>
      )}

      <div className="border-t border-border pt-4">
        <Link href="/login">
          <Button className="w-full">Accéder à la connexion</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted/50 p-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Chargement…</div>}>
        <VerifyInner />
      </Suspense>
    </div>
  );
}
