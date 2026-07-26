"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DashboardCard } from "@/components/DashboardCard";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { FileText, Users, MessageSquare, Clock } from "lucide-react";

export default function AnalyticsPage() {
  const { data } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get("/dashboard/statistics").then((r) => r.data),
  });
  const trend = [
    { day: "Lun", q: 12 }, { day: "Mar", q: 18 }, { day: "Mer", q: 22 },
    { day: "Jeu", q: 15 }, { day: "Ven", q: 30 }, { day: "Sam", q: 8 }, { day: "Dim", q: 5 },
  ];
  if (!data) return <div className="p-6">Chargement…</div>;
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Analytiques</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <DashboardCard title="Documents" value={data.totalDocuments} icon={FileText} />
        <DashboardCard title="Utilisateurs" value={data.totalUsers} icon={Users} />
        <DashboardCard title="Questions" value={data.totalQuestions} icon={MessageSquare} />
        <DashboardCard title="Latence" value={`${data.avgResponseTimeMs}ms`} icon={Clock} />
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="mb-3 font-semibold">Activité des questions (7 jours)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trend}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="q" stroke="hsl(var(--primary))" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
