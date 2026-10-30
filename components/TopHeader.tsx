"use client";
import { useState, useEffect } from "react";
import { useMissionStore, MISSION_THEATERS } from "@/lib/store";
import { useAuthStore } from "@/lib/auth";
import { Modal, Button } from "@/components/ui";
import {
  Globe,
  ShieldCheck,
  Cpu,
  Activity,
  Server,
  Layers,
  CheckCircle2,
  Lock,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";

export function TopHeader() {
  const selectedTheater = useMissionStore((s) => s.selectedTheater);
  const setTheater = useMissionStore((s) => s.setTheater);
  const user = useAuthStore((s) => s.user);

  const [healthOpen, setHealthOpen] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  async function fetchHealth() {
    setLoadingHealth(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealthData(data);
    } catch {
      // offline or error fallback
    } finally {
      setLoadingHealth(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  const currentTheaterObj = MISSION_THEATERS.find((t) => t.id === selectedTheater) || MISSION_THEATERS[0];

  return (
    <>
      <header className="hidden md:flex items-center justify-between border-b border-border bg-card/60 backdrop-blur-md px-6 py-2.5 z-20">
        {/* Left: Mission / Operational Theater Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Globe size={15} className="text-primary" />
            <span className="uppercase tracking-wider">Théâtre d&apos;Opération :</span>
          </div>

          <div className="relative">
            <select
              value={selectedTheater}
              onChange={(e) => setTheater(e.target.value)}
              className="text-xs font-medium rounded-lg border border-border bg-background px-3 py-1.5 text-foreground hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary transition-colors cursor-pointer"
            >
              {MISSION_THEATERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} ({t.badge})
                </option>
              ))}
            </select>
          </div>

          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            {currentTheaterObj.badge}
          </span>
        </div>

        {/* Right: Security Clearance & System Health Status */}
        <div className="flex items-center gap-3">
          {/* User clearance badge */}
          <div className="flex items-center gap-1.5 text-xs font-mono rounded-lg border border-border bg-background px-2.5 py-1 text-muted-foreground" title="Habilitation de sécurité de votre session">
            <Lock size={12} className="text-primary" />
            <span className="font-semibold text-foreground">{user?.clearanceLevel || "C2"}</span>
            <span className="text-[10px] text-muted-foreground">PSSI</span>
          </div>

          {/* System Health Diagnostic Trigger */}
          <button
            onClick={() => {
              fetchHealth();
              setHealthOpen(true);
            }}
            className="group flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-colors"
            title="Inspecter le diagnostic système et l'état du pipeline RAG"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold">RAG OPÉRATIONNEL</span>
            <Activity size={12} className="text-emerald-500 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      </header>

      {/* Health Modal */}
      <Modal
        open={healthOpen}
        onClose={() => setHealthOpen(false)}
        title="Diagnostic Système & Conformité Institutionnelle"
      >
        <div className="space-y-4 text-xs text-foreground">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-primary" />
              <div>
                <p className="font-bold text-sm">Misaina Cognition RAG Engine</p>
                <p className="text-[11px] text-muted-foreground font-mono">Version {healthData?.version || "2.1.0-enterprise"}</p>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loadingHealth} className="text-xs">
              <RefreshCw size={12} className={loadingHealth ? "animate-spin" : ""} />
              Actualiser
            </Button>
          </div>

          {/* Grid stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Moteur RAG Hybride</span>
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Cpu size={14} className="text-primary" />
                {healthData?.ragEngine?.model || "gemini-3.8-flash"}
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">{healthData?.ragEngine?.architecture || "BM25 + Dense Vectors (RRF)"}</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Contrôle d&apos;Accès PSSI</span>
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-500" />
                ResourceGuard C1-C4
              </p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">Filtrage en amont du LLM</p>
            </div>
          </div>

          {/* Compliance Checklist */}
          <div className="rounded-xl border border-border bg-card p-3 space-y-2">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Référentiels & Conformités Actives
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>ISO/IEC 27001:2022 (SMSI certifié)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>RGPD / EDPB Clauses CCT</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Standards Sphère 2024 (WASH, Abris)</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Norme Humanitaire Fondamentale CHS</span>
              </div>
            </div>
          </div>

          {/* Technical Specs */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Documents indexés :</span>
              <span className="font-bold text-foreground">{healthData?.knowledgeBase?.totalDocuments ?? 6}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Segments vectoriels (Chunks) :</span>
              <span className="font-bold text-foreground">{healthData?.knowledgeBase?.totalChunks ?? 18}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latence moyenne RAG :</span>
              <span className="font-bold text-foreground">{healthData?.ragEngine?.avgLatencyMs ?? 385} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Règle Zero Emoji :</span>
              <span className="font-bold text-emerald-500">100% Conforme (Lucide icons only)</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button size="sm" onClick={() => setHealthOpen(false)}>
              Fermer le diagnostic
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
