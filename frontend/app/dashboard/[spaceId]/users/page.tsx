"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  XCircle,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useSession } from "@/components/SessionProvider";
import { TableSkeleton } from "@/components/Skeletons";
import { SpaceHeader } from "@/components/SpaceHeader";
import { ToastBanner, type BannerMessage } from "@/components/ToastBanner";
import {
  describeApiError,
  guardianApi,
  isUnauthorizedError,
  type AccountStatus,
  type AuthUser,
  type EnterpriseLeadRequest,
  type Permission,
  type PermissionOption,
  type UserRole,
  type UserSpace,
} from "@/lib/api";

interface UserDraft {
  role: UserRole;
  permissions: Permission[];
  spaceIds: string[];
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: "LECTEUR", label: "LECTEUR — Consultation seule" },
  { value: "ANALYSTE", label: "ANALYSTE — Ingestion, Agent & Exports" },
  { value: "COORDINATEUR", label: "COORDINATEUR — Validation, Rollback & Règles" },
  { value: "USER", label: "USER — Opérateur complet sans gestion comptes" },
  { value: "ADMIN", label: "ADMIN — Administrateur organisation" },
  { value: "SUPER_ADMIN", label: "SUPER_ADMIN — Gouvernance globale multi-tenant" },
];

function statusBadge(status?: AccountStatus) {
  switch (status) {
    case "active":
      return {
        label: "Actif",
        cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    case "pending":
      return {
        label: "En attente",
        cls: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
      };
    case "suspended":
      return {
        label: "Suspendu",
        cls: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
      };
    case "rejected":
      return {
        label: "Refusé",
        cls: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
      };
    default:
      return {
        label: "Actif",
        cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
  }
}

export default function UsersManagementPage() {
  const params = useParams<{ spaceId: string }>();
  const router = useRouter();
  const spaceId = decodeURIComponent(params.spaceId || "");
  const encodedSpaceId = encodeURIComponent(spaceId);

  const { user: caller } = useSession();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [spaces, setSpaces] = useState<UserSpace[]>([]);
  const [enterpriseLeads, setEnterpriseLeads] = useState<EnterpriseLeadRequest[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionOption[]>([]);
  const [rolePresets, setRolePresets] = useState<Record<string, Permission[]>>({});
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [banner, setBanner] = useState<BannerMessage | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [confirmUserAction, setConfirmUserAction] = useState<{
    kind: "reject" | "suspend" | "reactivate";
    user: AuthUser;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<"all" | AccountStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDepartment, setNewDepartment] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<UserRole>("ANALYSTE");
  const [newSpaceIds, setNewSpaceIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const computeUserSpaceIds = useCallback((userId: string, spaceList: UserSpace[]): string[] => {
    return spaceList
      .filter((s) => s.ownerUserId === userId || s.memberUserIds.includes(userId))
      .map((s) => s.id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const [dir, leadsRes] = await Promise.all([
        guardianApi.getUsers(),
        guardianApi.getEnterpriseLeads().catch(() => ({ leads: [] })),
      ]);
      setUsers(dir.users || []);
      setSpaces(dir.spaces || []);
      setEnterpriseLeads(leadsRes.leads || []);
      setAvailablePermissions(dir.availablePermissions || []);
      setRolePresets(dir.rolePresets || {});

      const nextDrafts: Record<string, UserDraft> = {};
      for (const u of dir.users || []) {
        const role = (u.role as UserRole) || "LECTEUR";
        nextDrafts[u.id] = {
          role,
          permissions: [...(u.permissions || dir.rolePresets?.[role] || [])],
          spaceIds: computeUserSpaceIds(u.id, dir.spaces || []),
        };
      }
      setDrafts(nextDrafts);
      setNewSpaceIds((prev) => (prev.length > 0 ? prev : spaceId ? [spaceId] : []));
    } catch (err) {
      if (isUnauthorizedError(err)) {
        router.replace("/login");
        return;
      }
      const msg = describeApiError(err);
      if (msg.includes("HTTP 403")) {
        setAccessDenied(true);
      } else {
        setBanner({ kind: "err", text: msg });
      }
    } finally {
      setLoading(false);
    }
  }, [computeUserSpaceIds, router, spaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pendingUsers = useMemo(
    () => users.filter((u) => u.status === "pending"),
    [users]
  );

  const activeCount = useMemo(
    () => users.filter((u) => (u.status || "active") === "active").length,
    [users]
  );

  const blockedCount = useMemo(
    () => users.filter((u) => u.status === "suspended" || u.status === "rejected").length,
    [users]
  );

  const filteredDirectoryUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      const st = u.status || "active";
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department.toLowerCase().includes(q) ||
        String(u.role).toLowerCase().includes(q)
      );
    });
  }, [searchQuery, statusFilter, users]);

  function updateDraft(userId: string, updater: (prev: UserDraft) => UserDraft) {
    setDrafts((prev) => {
      const current = prev[userId] || {
        role: "LECTEUR" as UserRole,
        permissions: [],
        spaceIds: [],
      };
      return { ...prev, [userId]: updater(current) };
    });
  }

  function handleRolePresetChange(userId: string, nextRole: UserRole) {
    const presetPerms = rolePresets[nextRole] || [];
    updateDraft(userId, (curr) => ({
      ...curr,
      role: nextRole,
      permissions: [...presetPerms],
    }));
  }

  function toggleDraftPermission(userId: string, perm: Permission) {
    updateDraft(userId, (curr) => {
      const exists = curr.permissions.includes(perm);
      return {
        ...curr,
        permissions: exists
          ? curr.permissions.filter((p) => p !== perm)
          : [...curr.permissions, perm],
      };
    });
  }

  function toggleDraftSpace(userId: string, targetSpaceId: string) {
    updateDraft(userId, (curr) => {
      const exists = curr.spaceIds.includes(targetSpaceId);
      return {
        ...curr,
        spaceIds: exists
          ? curr.spaceIds.filter((s) => s !== targetSpaceId)
          : [...curr.spaceIds, targetSpaceId],
      };
    });
  }

  async function handleApproveOrReject(user: AuthUser, decision: "approve" | "reject") {
    const draft = drafts[user.id];
    setBusyUserId(user.id);
    setBanner(null);
    try {
      await guardianApi.approveUser({
        userId: user.id,
        decision,
        role: decision === "approve" ? draft?.role : undefined,
        permissions: decision === "approve" ? draft?.permissions : undefined,
        spaceIds: decision === "approve" ? draft?.spaceIds : undefined,
      });
      await refresh();
      setBanner({
        kind: "ok",
        text:
          decision === "approve"
            ? `Compte de ${user.fullName} validé et activé avec le rôle ${draft?.role || user.role}.`
            : `Demande de ${user.fullName} refusée.`,
      });
    } catch (err) {
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleSaveUserPermissions(user: AuthUser) {
    const draft = drafts[user.id];
    if (!draft) return;
    setBusyUserId(user.id);
    setBanner(null);
    try {
      await guardianApi.updateUserPermissions({
        userId: user.id,
        role: draft.role,
        permissions: draft.permissions,
        spaceIds: draft.spaceIds,
      });
      await refresh();
      setBanner({
        kind: "ok",
        text: `Droits et périmètres enregistrés pour ${user.fullName} (${draft.permissions.length} permission(s)).`,
      });
    } catch (err) {
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleToggleSuspend(user: AuthUser) {
    const nextStatus = user.status === "suspended" ? "active" : "suspended";
    setBusyUserId(user.id);
    setBanner(null);
    try {
      await guardianApi.updateUserPermissions({
        userId: user.id,
        status: nextStatus,
      });
      await refresh();
      setBanner({
        kind: "ok",
        text:
          nextStatus === "suspended"
            ? `Compte de ${user.fullName} suspendu immédiatement.`
            : `Compte de ${user.fullName} réactivé.`,
      });
    } catch (err) {
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleCreateAdminUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setBanner(null);
    try {
      await guardianApi.createUserByAdmin({
        fullName: newFullName.trim(),
        email: newEmail.trim(),
        department: newDepartment.trim(),
        password: newPassword,
        role: newRole,
        permissions: rolePresets[newRole],
        spaceIds: newSpaceIds,
      });
      setNewFullName("");
      setNewEmail("");
      setNewDepartment("");
      setNewPassword("");
      setShowCreateForm(false);
      await refresh();
      setBanner({
        kind: "ok",
        text: "Compte créé et activé immédiatement par l'administration.",
      });
    } catch (err) {
      setBanner({ kind: "err", text: describeApiError(err) });
    } finally {
      setCreating(false);
    }
  }

  const isCallerSuperAdmin = caller?.role === "SUPER_ADMIN";
  const selectableRoles = ROLE_OPTIONS.filter(
    (opt) => opt.value !== "SUPER_ADMIN" || isCallerSuperAdmin
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SpaceHeader
        spaceId={spaceId}
        activeSection="users"
        title="Gestion Utilisateurs, Validation & Permissions (RBAC)"
        subtitle="Validation obligatoire des nouveaux comptes, attribution des rôles et contrôle granulaire des permissions par espace isolé."
        actions={
          <>
            {!accessDenied && (
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                <UserPlus size={14} />
                {showCreateForm ? "Fermer le formulaire" : "Créer un compte actif"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-2 text-xs text-muted-foreground hover:text-foreground"
              aria-label="Actualiser l'annuaire"
            >
              <RefreshCw size={14} />
            </button>
          </>
        }
      />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <ToastBanner banner={banner} onDismiss={() => setBanner(null)} />

        {accessDenied ? (
          <section className="rounded-2xl border border-red-500/30 bg-card p-8 text-center space-y-3 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
              <ShieldAlert size={24} />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              Accès restreint à l&apos;administration
            </h2>
            <p className="mx-auto max-w-md text-xs text-muted-foreground leading-relaxed">
              La validation des comptes et la gestion des permissions nécessitent la permission{" "}
              <code className="font-mono text-foreground">users:manage</code> (Super Admin SAINA ou
              Administrateur).
            </p>
            <div className="pt-2">
              <Link
                href={`/dashboard/${encodedSpaceId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Retour au tableau de bord
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* KPI Bar */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Comptes actifs</span>
                  <UserCheck size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-foreground">{activeCount}</p>
                <p className="text-[11px] text-muted-foreground">Sessions autorisées</p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  <span>À valider</span>
                  <Clock size={14} />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-foreground">{pendingUsers.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  Inscriptions bloquées avant approbation
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Suspendus / Refusés</span>
                  <Ban size={14} className="text-red-500" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-foreground">{blockedCount}</p>
                <p className="text-[11px] text-muted-foreground">Accès révoqués</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Périmètres isolés</span>
                  <Lock size={14} className="text-primary" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-foreground">{spaces.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isCallerSuperAdmin
                    ? "Visibilité Super Admin globale"
                    : "Périmètre de votre organisation"}
                </p>
              </div>
            </section>

            {/* Admin Direct Creation Form */}
            {showCreateForm && (
              <section className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus size={16} className="text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">
                      Créer et activer un compte utilisateur directement
                    </h2>
                  </div>
                  <span className="font-mono text-[10px] uppercase text-primary">
                    Activation immédiate
                  </span>
                </div>

                <form onSubmit={handleCreateAdminUser} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Nom complet
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        placeholder="Ex. Hery Andriamanjato"
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Email professionnel
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="nom@organisation.org"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Organisation / Département
                      </label>
                      <input
                        type="text"
                        required
                        minLength={2}
                        placeholder="Ex. Mission Sahel"
                        value={newDepartment}
                        onChange={(e) => setNewDepartment(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Mot de passe initial (6 car. min.)
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mot de passe robuste"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-9 text-xs outline-none focus:border-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((prev) => !prev)}
                          className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                          aria-label={showNewPassword ? "Masquer" : "Afficher"}
                        >
                          {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Rôle attribué
                      </label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                      >
                        {selectableRoles.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {spaces.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Espaces isolés autorisés
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {spaces.map((sp) => {
                          const checked = newSpaceIds.includes(sp.id);
                          return (
                            <label
                              key={sp.id}
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                                checked
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setNewSpaceIds((prev) =>
                                    prev.includes(sp.id)
                                      ? prev.filter((s) => s !== sp.id)
                                      : [...prev, sp.id]
                                  )
                                }
                                className="accent-primary"
                              />
                              <span>{sp.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">
                                ({sp.id})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      <CheckCircle2 size={13} />
                      {creating ? "Création…" : "Créer et activer le compte"}
                    </button>
                  </div>
                </form>
              </section>
            )}

            {/* Pending Approvals Queue */}
            <section className="rounded-2xl border border-amber-500/30 bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Demandes d&apos;inscription en attente de validation ({pendingUsers.length})
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Tout compte créé publiquement reste bloqué tant qu&apos;il n&apos;est pas
                      approuvé ici avec un rôle et au moins un espace autorisé.
                    </p>
                  </div>
                </div>
              </div>

              {pendingUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-xs text-muted-foreground">
                  Aucune demande de création de compte en attente pour le moment.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingUsers.map((u) => {
                    const draft = drafts[u.id] || {
                      role: (u.role as UserRole) || "LECTEUR",
                      permissions: u.permissions || [],
                      spaceIds: [],
                    };
                    const isBusy = busyUserId === u.id;
                    return (
                      <div
                        key={u.id}
                        className="rounded-xl border border-amber-500/30 bg-background/70 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {u.fullName}
                              </span>
                              <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                                En attente
                              </span>
                            </div>
                            <p className="font-mono text-xs text-muted-foreground">{u.email}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Organisation :{" "}
                              <strong className="text-foreground">{u.department}</strong> · Rôle
                              demandé :{" "}
                              <span className="font-mono text-primary">{u.role}</span>
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Rôle pour ${u.fullName}`}
                              value={draft.role}
                              onChange={(e) =>
                                handleRolePresetChange(u.id, e.target.value as UserRole)
                              }
                              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                            >
                              {selectableRoles.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.value}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleApproveOrReject(u, "approve")}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              Valider et activer
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setConfirmUserAction({ kind: "reject", user: u })}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <XCircle size={13} />
                              Refuser
                            </button>
                          </div>
                        </div>

                        {spaces.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-2.5">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Espaces autorisés :
                            </span>
                            {spaces.map((sp) => {
                              const checked = draft.spaceIds.includes(sp.id);
                              return (
                                <label
                                  key={sp.id}
                                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                                    checked
                                      ? "border-primary bg-primary/10 text-foreground"
                                      : "border-border bg-card text-muted-foreground"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleDraftSpace(u.id, sp.id)}
                                    className="accent-primary"
                                  />
                                  <span>{sp.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Full Users & Permissions Directory */}
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserCog size={16} className="text-primary" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Annuaire des comptes & Matrice de permissions ({filteredDirectoryUsers.length})
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Sélectionnez un utilisateur pour ajuster son rôle, ses droits unitaires ou son
                      accès aux espaces.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher nom, email…"
                      className="rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <select
                    aria-label="Filtrer par statut"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | AccountStatus)}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Actifs</option>
                    <option value="pending">En attente</option>
                    <option value="suspended">Suspendus</option>
                    <option value="rejected">Refusés</option>
                  </select>
                </div>
              </div>

              {loading && users.length === 0 ? (
                <TableSkeleton rows={5} columns={4} />
              ) : filteredDirectoryUsers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/60 p-6 text-center text-xs text-muted-foreground">
                  Aucun utilisateur ne correspond aux critères.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDirectoryUsers.map((u) => {
                    const badge = statusBadge(u.status);
                    const draft = drafts[u.id] || {
                      role: (u.role as UserRole) || "LECTEUR",
                      permissions: u.permissions || [],
                      spaceIds: [],
                    };
                    const isExpanded = expandedUserId === u.id;
                    const isSelf = caller?.id === u.id;
                    const isProtectedSuperAdmin =
                      u.role === "SUPER_ADMIN" && !isCallerSuperAdmin;
                    const isBusy = busyUserId === u.id;

                    return (
                      <div
                        key={u.id}
                        className="rounded-xl border border-border bg-background/60 transition-colors"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {u.fullName}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-primary">
                                {u.role}
                              </span>
                              {isSelf && (
                                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  Session actuelle
                                </span>
                              )}
                            </div>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {u.email}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Organisation : {u.department} ·{" "}
                              <span className="font-mono">
                                {(u.permissions || []).length}/{availablePermissions.length} droits
                              </span>
                              {" · "}
                              <span>{draft.spaceIds.length} espace(s)</span>
                              {u.validatedBy && (
                                <span> · Validé par {u.validatedBy}</span>
                              )}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {u.status !== "pending" &&
                              u.status !== "rejected" &&
                              !isSelf &&
                              !isProtectedSuperAdmin && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setConfirmUserAction({
                                      kind: u.status === "suspended" ? "reactivate" : "suspend",
                                      user: u,
                                    })
                                  }
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                                    u.status === "suspended"
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
                                  } disabled:opacity-50`}
                                >
                                  <Ban size={12} />
                                  {u.status === "suspended" ? "Réactiver" : "Suspendre"}
                                </button>
                              )}

                            <button
                              type="button"
                              disabled={isProtectedSuperAdmin}
                              onClick={() =>
                                setExpandedUserId((prev) => (prev === u.id ? null : u.id))
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                            >
                              <KeyRound size={12} />
                              {isExpanded ? "Fermer droits" : "Configurer permissions"}
                            </button>
                          </div>
                        </div>

                        {isExpanded && !isProtectedSuperAdmin && (
                          <div className="border-t border-border bg-card/70 p-4 space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div className="space-y-1">
                                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Préréglage de rôle
                                </label>
                                <select
                                  value={draft.role}
                                  onChange={(e) =>
                                    handleRolePresetChange(u.id, e.target.value as UserRole)
                                  }
                                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                                >
                                  {selectableRoles.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Espaces autorisés
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {spaces.map((sp) => {
                                    const checked = draft.spaceIds.includes(sp.id);
                                    return (
                                      <label
                                        key={sp.id}
                                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                                          checked
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-border bg-background text-muted-foreground"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleDraftSpace(u.id, sp.id)}
                                          className="accent-primary"
                                        />
                                        <span>{sp.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Permissions granulaires ({draft.permissions.length}/
                                {availablePermissions.length})
                              </p>
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {availablePermissions.map((perm) => {
                                  const checked = draft.permissions.includes(perm.code);
                                  return (
                                    <label
                                      key={perm.code}
                                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition-colors ${
                                        checked
                                          ? "border-primary/40 bg-primary/5 text-foreground"
                                          : "border-border bg-background text-muted-foreground"
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleDraftPermission(u.id, perm.code)}
                                        className="mt-0.5 accent-primary"
                                      />
                                      <div className="min-w-0">
                                        <p className="font-medium leading-snug">{perm.label}</p>
                                        <p className="font-mono text-[10px] text-muted-foreground">
                                          {perm.code}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <ShieldCheck size={13} className="text-primary" />
                                Les permissions sont vérifiées côté serveur à chaque requête API.
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveUserPermissions(u)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                              >
                                <Save size={13} />
                                {isBusy ? "Enregistrement…" : "Enregistrer les permissions"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Demandes Déploiement Grands Comptes */}
            <details className="group rounded-2xl border border-border bg-card p-5 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-primary" />
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Demandes Déploiement Grands Comptes ({enterpriseLeads.length})
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Sollicitations soumises via le formulaire public SecNumCloud / On-Premise.
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className="text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>

              <div className="mt-4 border-t border-border pt-4">
                {enterpriseLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune demande commerciale ou d&apos;audit reçue pour le moment.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-[11px] uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3">Ticket</th>
                          <th className="py-2 pr-3">Organisation</th>
                          <th className="py-2 pr-3">Contact</th>
                          <th className="py-2 pr-3">Effectif</th>
                          <th className="py-2 pr-3">Architecture</th>
                          <th className="py-2 pr-3">Besoin</th>
                          <th className="py-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {enterpriseLeads.map((lead) => (
                          <tr key={lead.id}>
                            <td className="py-2 pr-3 font-mono text-[11px] text-primary">
                              {lead.id}
                            </td>
                            <td className="py-2 pr-3 font-semibold text-foreground">
                              {lead.organization}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground">
                              {lead.contactName} ({lead.email})
                            </td>
                            <td className="py-2 pr-3 font-mono text-[11px]">
                              {lead.employeeCount}
                            </td>
                            <td className="py-2 pr-3 font-mono text-[11px] text-primary">
                              {lead.deploymentMode}
                            </td>
                            <td className="py-2 pr-3 text-muted-foreground max-w-xs truncate">
                              {lead.message}
                            </td>
                            <td className="py-2 text-right font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                              {new Date(lead.createdAt).toLocaleDateString("fr-FR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </main>

      <ConfirmDialog
        open={Boolean(confirmUserAction)}
        title={
          confirmUserAction?.kind === "reject"
            ? `Refuser la demande de ${confirmUserAction.user.fullName} ?`
            : confirmUserAction?.kind === "suspend"
              ? `Suspendre le compte de ${confirmUserAction.user.fullName} ?`
              : `Réactiver le compte de ${confirmUserAction?.user.fullName} ?`
        }
        description={
          confirmUserAction?.kind === "reject"
            ? "La demande d'accès sera marquée comme refusée et la connexion restera bloquée."
            : confirmUserAction?.kind === "suspend"
              ? "L'utilisateur perdra immédiatement l'accès à ses sessions et périmètres isolés."
              : "L'utilisateur retrouvera l'accès aux espaces et permissions qui lui sont assignés."
        }
        confirmLabel={
          confirmUserAction?.kind === "reject"
            ? "Refuser le compte"
            : confirmUserAction?.kind === "suspend"
              ? "Suspendre immédiatement"
              : "Réactiver le compte"
        }
        variant={confirmUserAction?.kind === "reactivate" ? "warning" : "danger"}
        busy={Boolean(busyUserId)}
        onCancel={() => setConfirmUserAction(null)}
        onConfirm={async () => {
          if (!confirmUserAction) return;
          if (confirmUserAction.kind === "reject") {
            await handleApproveOrReject(confirmUserAction.user, "reject");
          } else {
            await handleToggleSuspend(confirmUserAction.user);
          }
          setConfirmUserAction(null);
        }}
      />
    </div>
  );
}
