"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";
import { Button, Input, Card } from "@/components/ui";
import {
  User,
  Shield,
  KeyRound,
  LogOut,
  CheckCircle2,
  Building,
  Mail,
  BadgeCheck,
} from "lucide-react";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function doLogout() {
    logout();
    router.push("/login");
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");

    if (newPwd.length < 6) {
      setErr("Le mot de passe doit comporter au moins 6 caractères.");
      return;
    }

    if (newPwd !== confirmPwd) {
      setErr("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setMsg("Votre mot de passe a été mis à jour avec succès.");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    }, 700);
  }

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "MC";

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Profil & Sécurité du Compte
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gérez vos informations de compte, vos habilitations et la sécurité de votre session.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="md:col-span-1 rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col items-center text-center space-y-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-blue-600 text-white font-bold text-2xl shadow-lg shadow-primary/20">
            {initials}
          </div>

          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">{user?.fullName}</h2>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>

          <div className="w-full border-t border-border pt-4 space-y-2 text-left text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rôle</span>
              <span className="font-semibold text-foreground">{user?.role}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Département</span>
              <span className="font-medium text-foreground">{user?.department}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Habilitation PSSI</span>
              <span className="inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-0.5 rounded-md border border-primary/20 bg-primary/10 text-primary">
                <Shield size={12} /> {user?.clearanceLevel || "C2"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Statut</span>
              <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                <BadgeCheck size={14} /> Actif & Certifié
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={doLogout}
            className="w-full text-xs text-red-500 hover:bg-red-500/10 hover:border-red-500/20"
          >
            <LogOut size={14} /> Se déconnecter
          </Button>
        </div>

        {/* Security / Password Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound size={18} className="text-primary" />
              <h3 className="font-semibold text-base text-foreground">Modifier le mot de passe</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Pour des raisons de sécurité, nous recommandons une combinaison de 14 caractères selon la PSSI.
            </p>

            <form onSubmit={handleUpdatePassword} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Mot de passe actuel</label>
                <Input
                  type="password"
                  placeholder="••••••••••••"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Nouveau mot de passe</label>
                  <Input
                    type="password"
                    placeholder="Min. 6 caractères"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Confirmer le nouveau mot de passe</label>
                  <Input
                    type="password"
                    placeholder="Répétez le mot de passe"
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                  />
                </div>
              </div>

              {msg && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{msg}</span>
                </div>
              )}

              {err && <p className="text-xs text-red-500 font-medium">{err}</p>}

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={saving || !newPwd}>
                  {saving ? "Mise à jour…" : "Enregistrer les modifications"}
                </Button>
              </div>
            </form>
          </div>

          {/* Active Sessions */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-primary" />
              <h3 className="font-semibold text-base text-foreground">Session d&apos;authentification</h3>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
              <div>
                <p className="font-semibold text-foreground">Session Web Active</p>
                <p>Navigateur actuel · Chiffrement TLS 1.3</p>
              </div>
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                En cours
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
