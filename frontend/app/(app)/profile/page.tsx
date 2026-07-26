"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { Button, Input, Card } from "@/components/ui";
import { LogOut } from "lucide-react";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState("");

  function doLogout() { logout(); router.push("/login"); }

  async function changePassword() {
    // Réutilise le flux forgot/reset via email (simple). Ici on informe l'utilisateur.
    setMsg("Utilisez « Mot de passe oublié » depuis la connexion pour le modifier en toute sécurité.");
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Mon profil</h1>
      <Card className="max-w-md space-y-3">
        <div><span className="text-sm text-muted-foreground">Nom</span><p className="font-medium">{user?.fullName}</p></div>
        <div><span className="text-sm text-muted-foreground">Email</span><p className="font-medium">{user?.email}</p></div>
        <div><span className="text-sm text-muted-foreground">Rôle</span><p className="font-medium">{user?.role}</p></div>
        <div><span className="text-sm text-muted-foreground">Département</span><p className="font-medium">{user?.department}</p></div>
      </Card>
      <Card className="max-w-md space-y-3">
        <h3 className="font-semibold">Sécurité</h3>
        <Input type="password" placeholder="Nouveau mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} />
        <Button onClick={changePassword}>Changer le mot de passe</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        <Button variant="outline" onClick={doLogout}><LogOut size={16} /> Se déconnecter</Button>
      </Card>
    </div>
  );
}
