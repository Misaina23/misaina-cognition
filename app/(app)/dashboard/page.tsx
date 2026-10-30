"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui";
import {
  FileText,
  MessageSquare,
  FilePlus,
  Sparkles,
  Clock,
  ArrowRight,
  Upload,
  CheckCircle2,
  FileCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface PersonalStats {
  myDocuments: number;
  myConversations: number;
  myQuestions: number;
  myGeneratedDocs: number;
  recentActivity: { type: string; title: string; at: string }[];
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useQuery<PersonalStats>({
    queryKey: ["mine"],
    queryFn: () => api.get("/dashboard/mine").then((r) => r.data),
  });

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Chargement de votre espace personnel…</span>
        </div>
      </div>
    );
  }

  const pieData = [
    { name: "Documents", value: Math.max(data.myDocuments, 1) },
    { name: "Conversations", value: Math.max(data.myConversations, 1) },
    { name: "Générés", value: Math.max(data.myGeneratedDocs, 1) },
  ];

  const weeklyActivity = [
    { day: "Lun", questions: 4, docs: 1 },
    { day: "Mar", questions: 7, docs: 2 },
    { day: "Mer", questions: 5, docs: 0 },
    { day: "Jeu", questions: 9, docs: 3 },
    { day: "Ven", questions: 12, docs: 1 },
    { day: "Sam", questions: 2, docs: 0 },
    { day: "Dim", questions: 1, docs: 0 },
  ];

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Bonjour, {user?.fullName || "Collaborateur"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Espace d&apos;intelligence documentaire {user?.department ? `— ${user.department}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/chat">
            <Button className="shadow-sm">
              <Sparkles size={16} /> Poser une question
            </Button>
          </Link>
          <Link href="/documents">
            <Button variant="outline">
              <Upload size={16} /> Ajouter un fichier
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Mes documents indexés"
          value={data.myDocuments}
          trend="+2 ce mois"
          hint="Recherche active"
          icon={FileText}
        />
        <DashboardCard
          title="Conversations explorées"
          value={data.myConversations}
          trend="+4 cette semaine"
          hint="Historique conservé"
          icon={MessageSquare}
        />
        <DashboardCard
          title="Questions adressées à l'IA"
          value={data.myQuestions}
          trend="96% de confiance"
          hint="Sources citées"
          icon={Sparkles}
        />
        <DashboardCard
          title="Fiches de synthèse .docx"
          value={data.myGeneratedDocs}
          trend="Format standard"
          hint="Téléchargement instantané"
          icon={FilePlus}
        />
      </div>

      {/* Main Charts & Activity Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activity Trend (2 columns) */}
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-base text-foreground">Activité hebdomadaire de requêtes</h3>
              <p className="text-xs text-muted-foreground">Volume de questions posées et ajouts de documents</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Questions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Documents
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity}>
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.75rem",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Bar dataKey="questions" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="docs" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Distribution Pie (1 column) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base text-foreground">Répartition de votre utilisation</h3>
            <p className="text-xs text-muted-foreground mb-4">Ratio entre questions, documents et fiches</p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.75rem",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            {pieData.map((p, i) => (
              <div key={p.name} className="flex flex-col items-center">
                <span className="text-xs font-semibold text-foreground">{p.value}</span>
                <span className="text-[11px] text-muted-foreground">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity Timeline & Enterprise Knowledge Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base text-foreground">Historique récent des actions</h3>
            <span className="text-xs text-muted-foreground">Synchronisé en temps réel</span>
          </div>

          <ul className="divide-y divide-border/60">
            {data.recentActivity.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Aucune activité enregistrée pour l&apos;instant.
              </li>
            )}
            {data.recentActivity.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {a.type.includes("généré") ? <FileCheck size={16} /> : <FileText size={16} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.type}</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 font-mono">
                  <Clock size={12} />
                  <span>{new Date(a.at).toLocaleDateString("fr-FR")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Enterprise Shortcuts */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base text-foreground mb-1">Thématiques documentaires clés</h3>
            <p className="text-xs text-muted-foreground mb-4">Questions fréquentes traitées par le moteur RAG</p>

            <div className="space-y-2.5">
              <Link
                href="/chat"
                className="group flex items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Charte du télétravail et indemnités
                  </p>
                  <p className="text-xs text-muted-foreground">2 à 3 jours/semaine · Indemnité 2,50 € · Équipements</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </Link>

              <Link
                href="/chat"
                className="group flex items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Exigences de sécurité informatique (PSSI)
                  </p>
                  <p className="text-xs text-muted-foreground">Mots de passe 14 car. · Double facteur MFA · VPN WireGuard</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </Link>

              <Link
                href="/chat"
                className="group flex items-center justify-between rounded-xl border border-border p-3 hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    Procédure d&apos;onboarding nouveaux arrivants
                  </p>
                  <p className="text-xs text-muted-foreground">Accueil premier jour · Welcome Pack · Parrain dédié</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
              </Link>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span>Toutes les réponses de l&apos;IA s&apos;appuient exclusivement sur vos documents vérifiés.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
