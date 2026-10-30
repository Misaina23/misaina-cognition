"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Input, Modal } from "@/components/ui";
import { SearchBar } from "@/components/SearchBar";
import {
  UserPlus,
  Shield,
  Briefcase,
  Mail,
  Trash2,
  CheckCircle2,
  Building,
} from "lucide-react";

export default function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("Tous");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    role: "EMPLOYEE",
    department: "R&D",
  });
  const [addError, setAddError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });

  const addUser = useMutation({
    mutationFn: (newUser: typeof form) => api.post("/users", newUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setIsAddOpen(false);
      setForm({ fullName: "", email: "", role: "EMPLOYEE", department: "R&D" });
    },
    onError: (err: any) => {
      setAddError(err?.response?.data?.message || "Erreur lors de l'ajout");
    },
  });

  const delUser = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const roles = ["Tous", "ADMIN", "MANAGER", "EMPLOYEE"];

  const filtered = (data ?? []).filter((u: any) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()) ||
      u.department.toLowerCase().includes(q.toLowerCase());

    const matchesRole = roleFilter === "Tous" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function getRoleBadge(role: string) {
    if (role === "ADMIN")
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
          <Shield size={11} /> Admin
        </span>
      );
    if (role === "MANAGER")
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
          <Briefcase size={11} /> Manager
        </span>
      );
    return (
      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Employé
      </span>
    );
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Gestion des Utilisateurs & Rôles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gouvernance des accès, attribution des rôles et autorisations documentaires.
          </p>
        </div>

        <Button onClick={() => setIsAddOpen(true)} className="shadow-sm">
          <UserPlus size={16} /> Ajouter un collaborateur
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex-1 max-w-md">
          <SearchBar onSearch={setQ} placeholder="Filtrer par nom, email ou département…" />
        </div>

        <div className="flex items-center gap-1">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                roleFilter === r
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table / Grid */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Chargement des comptes collaborateurs…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Aucun utilisateur ne correspond à votre filtre.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((u: any) => (
              <div
                key={u.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                    {getInitials(u.fullName)}
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-foreground truncate">{u.fullName}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {u.email}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1">
                        <Building size={12} /> {u.department}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                  {getRoleBadge(u.role)}

                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} /> Actif
                  </span>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Retirer l'accès pour ${u.fullName} ?`)) {
                        delUser.mutate(u.id);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                    title="Supprimer l'utilisateur"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddOpen && (
        <Modal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Ajouter un collaborateur"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAddError("");
              addUser.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Nom complet</label>
              <Input
                required
                placeholder="Ex: Thomas Pesquet"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Adresse Email</label>
              <Input
                required
                type="email"
                placeholder="Ex: thomas.pesquet@misaina.internal"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Rôle</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="flex h-9 w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="EMPLOYEE">Employé</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Département</label>
                <Input
                  required
                  placeholder="Ex: R&D, RH, Sécurité"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              </div>
            </div>

            {addError && <p className="text-xs text-red-500 font-medium">{addError}</p>}

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={addUser.isPending}>
                {addUser.isPending ? "Création…" : "Confirmer la création"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
