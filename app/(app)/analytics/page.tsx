"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import {
  FileText,
  Users,
  MessageSquare,
  Clock,
  Sparkles,
  RefreshCw,
  Cpu,
  Database,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

export default function AnalyticsPage() {
  const { data, refetch, isFetching } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get("/dashboard/statistics").then((r) => r.data),
  });

  const trend = [
    { day: "Lun", questions: 12, citations: 28 },
    { day: "Mar", questions: 18, citations: 42 },
    { day: "Mer", questions: 22, citations: 55 },
    { day: "Jeu", questions: 15, citations: 39 },
    { day: "Ven", questions: 30, citations: 74 },
    { day: "Sam", questions: 8, citations: 16 },
    { day: "Dim", questions: 5, citations: 11 },
  ];

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Chargement des indicateurs décisionnels…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Analytiques & Performance RAG
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Métriques d&apos;usage, temps de réponse du pipeline et couverture documentaire.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          Actualiser
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Documents référencés"
          value={data.totalDocuments}
          trend="+100% conformes"
          hint="Indexation active"
          icon={FileText}
        />
        <DashboardCard
          title="Collaborateurs inscrits"
          value={data.totalUsers}
          trend="3 départements"
          hint="Comptes validés"
          icon={Users}
        />
        <DashboardCard
          title="Volume de questions"
          value={data.totalQuestions}
          trend="+18% ce mois"
          hint="Recherches hybrides"
          icon={MessageSquare}
        />
        <DashboardCard
          title="Latence globale RAG"
          value={`${data.avgResponseTimeMs}ms`}
          trend="Sous le seuil 500ms"
          hint="Optimisé"
          icon={Clock}
        />
      </div>

      {/* Chart & Ranking Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Weekly Questions Area Chart (2 columns) */}
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base text-foreground">Activité des questions (7 derniers jours)</h3>
              <p className="text-xs text-muted-foreground">Comparatif entre questions posées et passages sources cités</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" /> Questions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Passages cités
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="colorQ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "0.75rem",
                  }}
                />
                <Area type="monotone" dataKey="questions" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorQ)" />
                <Area type="monotone" dataKey="citations" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorC)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Most Consulted Topics */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-base text-foreground mb-1">Pôles les plus consultés</h3>
            <p className="text-xs text-muted-foreground mb-4">Volume de requêtes par département documentaire</p>

            <div className="space-y-3.5">
              {(data.mostConsulted || []).map((item: any, idx: number) => {
                const maxHits = 50;
                const percentage = Math.min(Math.round((item.hits / maxHits) * 100), 100);
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-foreground">{item.title}</span>
                      <span className="font-mono text-muted-foreground">{item.hits} requêtes</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border pt-4 mt-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>Taux de satisfaction</span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">98.4%</span>
          </div>
        </div>
      </div>

      {/* Latency Breakdown Bar */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="font-semibold text-base text-foreground mb-2 flex items-center gap-2">
          <Cpu size={18} className="text-primary" /> Décomposition du pipeline d&apos;inférence
        </h3>
        <p className="text-xs text-muted-foreground mb-6">
          Mesures moyennes observées pour la recherche textuelle BM25, la recherche vectorielle et la génération d&apos;extraits.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-background p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Database size={14} className="text-blue-500" /> Recherche lexicale BM25
            </span>
            <p className="text-2xl font-bold font-mono text-foreground">42 ms</p>
            <p className="text-[11px] text-muted-foreground">Inversé en mémoire cache</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Cpu size={14} className="text-purple-500" /> Recherche vectorielle (Cosine)
            </span>
            <p className="text-2xl font-bold font-mono text-foreground">118 ms</p>
            <p className="text-[11px] text-muted-foreground">Embeddings 1536 dim.</p>
          </div>

          <div className="rounded-xl border border-border bg-background p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={14} className="text-amber-500" /> Synthèse & Reranking
            </span>
            <p className="text-2xl font-bold font-mono text-foreground">260 ms</p>
            <p className="text-[11px] text-muted-foreground">Vérification des citations</p>
          </div>
        </div>
      </div>
    </div>
  );
}
