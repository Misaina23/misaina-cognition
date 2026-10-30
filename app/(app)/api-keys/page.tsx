"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { Button, Modal, Input } from "@/components/ui";
import type { ApiKeyItem } from "@/lib/types";
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  Trash2,
  Shield,
  Activity,
  Server,
  Lock,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState("READ_ONLY");
  const [rateLimit, setRateLimit] = useState(120);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys = [], isLoading } = useQuery<ApiKeyItem[]>({
    queryKey: ["apiKeys"],
    queryFn: () => api.get("/api-keys").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api.post("/api-keys", body).then((r) => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["apiKeys"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      setNewlyCreatedToken(data.plainToken);
      setName("");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete("/api-keys", { data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });

  function copyToken(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Clés d&apos;API & Intégrations SI Headless
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Générez des jetons de service sécurisés pour connecter vos assistants Teams, ServiceNow, Slack ou applications métiers.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="shadow-sm">
          <Plus size={16} /> Créer une clé d&apos;API
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Jetons de service actifs"
          value={keys.filter((k) => k.status === "ACTIVE").length}
          trend="Scellés cryptographiquement"
          hint="Passerelles ouvertes"
          icon={KeyRound}
        />
        <DashboardCard
          title="Débit autorisé global"
          value="920 req/min"
          trend="Protection anti-déni"
          hint="Rate limiting actif"
          icon={Activity}
        />
        <DashboardCard
          title="Gouvernance des scopes"
          value="Zero-Trust"
          trend="Lecture seule prioritaire"
          hint="Restreint par périmètre"
          icon={Shield}
        />
        <DashboardCard
          title="Chiffrement des clés"
          value="SHA-256"
          trend="Hachage irréversible"
          hint="Audit de chaque appel"
          icon={Lock}
        />
      </div>

      {/* API Keys Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="border-b border-border bg-muted/40 px-6 py-4 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Jetons de service déclarés</h3>
          <span className="text-xs text-muted-foreground font-mono">{keys.length} clés enregistrées</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border font-semibold text-muted-foreground uppercase tracking-wider text-[11px] bg-muted/20">
              <tr>
                <th className="py-3 px-4">Application / Nom</th>
                <th className="py-3 px-4">Jeton masqué</th>
                <th className="py-3 px-4">Périmètre / Scope</th>
                <th className="py-3 px-4 text-center">Quota</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <p className="font-semibold text-foreground">{k.name}</p>
                    <p className="text-[11px] text-muted-foreground">{k.department}</p>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-muted-foreground whitespace-nowrap">
                    {k.tokenMasked}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="font-medium text-foreground">
                      {k.scope === "READ_ONLY" ? "Lecture Seule" : "Lecture / Écriture"}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono whitespace-nowrap">
                    {k.rateLimitPerMin} req/min
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {k.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> Actif
                      </span>
                    ) : (
                      <span className="font-medium text-red-500">Révoqué</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {k.status === "ACTIVE" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Révoquer définitivement la clé « ${k.name} » ?`)) {
                            revokeMutation.mutate(k.id);
                          }
                        }}
                        className="text-xs h-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 size={13} className="mr-1" /> Révoquer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {isCreateOpen && (
        <Modal
          isOpen={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            setNewlyCreatedToken(null);
          }}
          title={newlyCreatedToken ? "Jeton d'API Généré avec Succès" : "Nouvelle Clé d'API d'Intégration"}
        >
          {newlyCreatedToken ? (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-700 dark:text-amber-300">
                <span className="font-semibold block mb-0.5">Attention — Clé à copier immédiatement</span>
                Ce jeton d&apos;authentification ne sera plus jamais affiché. Conservez-le dans votre coffre-fort de mots de passe d&apos;entreprise (Vault / CyberArk).
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Jeton secret généré</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={newlyCreatedToken}
                    className="flex-1 rounded-lg border border-border bg-muted/60 p-2 font-mono text-xs text-foreground outline-none select-all"
                  />
                  <Button
                    size="sm"
                    onClick={() => copyToken(newlyCreatedToken)}
                    className="shrink-0"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copié" : "Copier"}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => {
                    setIsCreateOpen(false);
                    setNewlyCreatedToken(null);
                  }}
                >
                  Terminer
                </Button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  name,
                  scope,
                  rateLimitPerMin: rateLimit,
                });
              }}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Nom du service ou robot</label>
                <Input
                  placeholder="Ex: Bot Teams RH ou Intranet Global"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Portée des droits (Scope)</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="READ_ONLY">Lecture seule (Recherche documentaire & Chat RAG)</option>
                  <option value="READ_WRITE">Lecture & Écriture (Indexation de documents)</option>
                  <option value="AUDIT_ONLY">Audit seul (Extraction des journaux de conformité)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Plafond de requêtes (Rate limit)</label>
                <select
                  value={rateLimit}
                  onChange={(e) => setRateLimit(Number(e.target.value))}
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value={60}>60 requêtes / minute</option>
                  <option value={120}>120 requêtes / minute (Recommandé)</option>
                  <option value={300}>300 requêtes / minute (Passerelles de masse)</option>
                  <option value={600}>600 requêtes / minute</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={!name}>
                  Générer le jeton sécurisé
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
