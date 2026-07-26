"use client";
import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Button, Input, Card } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    setErr("");
    try { await authApi.forgot(email); setSent(true); }
    catch { setErr("Une erreur est survenue"); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted">
      <Card className="w-96 space-y-4">
        <h1 className="text-xl font-bold text-center">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground text-center">Entrez votre email pour recevoir un lien de réinitialisation.</p>
        <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {sent && <p className="text-sm text-green-500">Si le compte existe, un email a été envoyé.</p>}
        {err && <p className="text-sm text-red-500">{err}</p>}
        <Button className="w-full" onClick={send}>Envoyer le lien</Button>
        <p className="text-center text-sm"><Link href="/login" className="text-primary hover:underline">Retour à la connexion</Link></p>
      </Card>
    </div>
  );
}
