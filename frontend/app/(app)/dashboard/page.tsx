"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { DashboardCard } from "@/components/DashboardCard";
import { FileText, MessageSquare, FilePlus, Sparkles, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";

interface PersonalStats {
  myDocuments: number;
  myConversations: number;
  myQuestions: number;
  myGeneratedDocs: number;
  recentActivity: { type: string; title: string; at: string }[];
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery<PersonalStats>({
    queryKey: ["mine"],
    queryFn: () => api.get("/dashboard/mine").then((r) => r.data),
  });

  if (!data) return <div className="p-6">Chargement de votre espace…</div>;

  const pie = [
    { name: "Documents", value: data.myDocuments },
    { name: "Conversations", value: data.myConversations },
    { name: "Générés", value: data.myGeneratedDocs },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Bonjour {user?.fullName} 👋</h1>
        <p className="text-muted-foreground">Votre espace personnel Misaina Cognition</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <DashboardCard title="Mes documents" value={data.myDocuments} icon={FileText} />
        <DashboardCard title="Mes conversations" value={data.myConversations} icon={MessageSquare} />
        <DashboardCard title="Mes questions" value={data.myQuestions} icon={Sparkles} />
        <DashboardCard title="Documents générés" value={data.myGeneratedDocs} icon={FilePlus} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 font-semibold">Activité récente</h3>
          <ul className="space-y-2">
            {data.recentActivity.length === 0 && <li className="text-sm text-muted-foreground">Aucune activité pour l'instant.</li>}
            {data.recentActivity.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <Clock size={14} className="text-primary" />
                <span className="font-medium">{a.type}</span> — {a.title}
                <span className="ml-auto text-muted-foreground">{new Date(a.at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 font-semibold">Répartition de votre activité</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pie} dataKey="value" nameKey="name" outerRadius={80} label>
                {pie.map((_, i) => <Cell key={i} fill={`hsl(${i * 90 + 200}, 70%, 50%)`} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
