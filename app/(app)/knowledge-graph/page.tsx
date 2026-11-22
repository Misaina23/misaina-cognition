"use client";
import { useState } from "react";
import Link from "next/link";
import { DashboardCard } from "@/components/DashboardCard";
import { Button, Modal } from "@/components/ui";
import {
  Network,
  GitBranch,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Layers,
  Sparkles,
  Building,
  CheckCircle2,
  FileText,
  Filter,
  Download,
  Search,
  Compass,
} from "lucide-react";

interface NodeItem {
  id: string;
  title: string;
  category: "Norme Fondamentale" | "SOP Opérationnel" | "Politique PSSI" | "Contrat & Bailleurs" | "Directive Mission";
  classification: "C1" | "C2" | "C3" | "C4";
  theater: string;
  version: string;
  dependenciesUpstream: string[]; // IDs of documents it depends on
  dependenciesDownstream: string[]; // IDs of documents that depend on it
  summary: string;
  impactIfModified: "CRITIQUE" | "ÉLEVÉ" | "MODÉRÉ";
  lastAuditDate: string;
}

const NODES: NodeItem[] = [
  {
    id: "node-sphere",
    title: "Standards Minimaux du Projet Sphère 2024",
    category: "Norme Fondamentale",
    classification: "C1",
    theater: "Toutes les Missions & Siège",
    version: "v2024.1",
    dependenciesUpstream: [],
    dependenciesDownstream: ["node-sop-sec", "node-convoi-goma", "node-contrat-wash"],
    summary: "Seuils universels d'urgence : 15L d'eau potable/pers/j, 3,5m² d'abri individuel, ratios de chlore libre (0,5 mg/l) et 20 pers/latrine.",
    impactIfModified: "CRITIQUE",
    lastAuditDate: "15 Janvier 2026",
  },
  {
    id: "node-pssi",
    title: "Système SMSI ISO/IEC 27001:2022 & PSSI 2026",
    category: "Politique PSSI",
    classification: "C4",
    theater: "Toutes les Missions & Siège",
    version: "v4.2",
    dependenciesUpstream: [],
    dependenciesDownstream: ["node-teletravail", "node-api-si", "node-rgpd-humanitaire"],
    summary: "Architecture Zero Trust, chiffrement AES-256-GCM, modules HSM FIPS 140-3 Niveau 3, clés matérielles FIDO2 et notification d'incident sous 72h.",
    impactIfModified: "CRITIQUE",
    lastAuditDate: "02 Février 2026",
  },
  {
    id: "node-sop-sec",
    title: "SOP Sécurité Terrain & Évacuation (SOP-SEC-09)",
    category: "SOP Opérationnel",
    classification: "C4",
    theater: "Hub Opérationnel d'Urgence - Goma",
    version: "v2.0",
    dependenciesUpstream: ["node-sphere"],
    dependenciesDownstream: ["node-convoi-goma", "node-safe-room"],
    summary: "Matrice des 4 niveaux d'alerte opérationnelle (Vert, Jaune, Orange, Rouge), déclenchement d'évacuation, convois 2x4x4 avec VHF Codan et Safe Room 72h.",
    impactIfModified: "CRITIQUE",
    lastAuditDate: "10 Février 2026",
  },
  {
    id: "node-usaid-echo",
    title: "Directives Bailleurs Internationaux USAID & DG ECHO",
    category: "Contrat & Bailleurs",
    classification: "C2",
    theater: "Siège Global - Genève / Paris",
    version: "v3.1",
    dependenciesUpstream: [],
    dependenciesDownstream: ["node-contrat-wash", "node-achats-sahel"],
    summary: "Seuils financiers obligatoires d'achats : <3k$ gré à gré, 3k-10k$ 3 devis comparatifs, 10k-50k$ procédure négociée, >50k$ appel d'offres international + No Objection.",
    impactIfModified: "CRITIQUE",
    lastAuditDate: "20 Janvier 2026",
  },
  {
    id: "node-rgpd-humanitaire",
    title: "Gouvernance RGPD & Données Humanitaires (EDPB)",
    category: "Norme Fondamentale",
    classification: "C3",
    theater: "Mission Réponse Rapide - Kyiv",
    version: "v1.8",
    dependenciesUpstream: ["node-pssi"],
    dependenciesDownstream: ["node-biometrie-refugies"],
    summary: "Minimisation des données d'aide vitale, AIPD/DPIA obligatoire pour toute biométrie des bénéficiaires et Clauses Contractuelles Types CCT 2021/914.",
    impactIfModified: "ÉLEVÉ",
    lastAuditDate: "05 Mars 2026",
  },
  {
    id: "node-chs-psea",
    title: "Norme Humanitaire Fondamentale CHS & Politique PSEA",
    category: "Norme Fondamentale",
    classification: "C2",
    theater: "Toutes les Missions & Siège",
    version: "v2.2",
    dependenciesUpstream: [],
    dependenciesDownstream: ["node-redevabilite-plaintes"],
    summary: "Redevabilité envers les bénéficiaires, boîtes à réclamations traitées sous 5 jours ouvrés et tolérance zéro sur l'exploitation et les abus sexuels.",
    impactIfModified: "CRITIQUE",
    lastAuditDate: "18 Février 2026",
  },
  {
    id: "node-teletravail",
    title: "Charte du Télétravail & Flexibilité Hybride",
    category: "SOP Opérationnel",
    classification: "C2",
    theater: "Siège Global - Genève / Paris",
    version: "v1.3",
    dependenciesUpstream: ["node-pssi"],
    dependenciesDownstream: [],
    summary: "Modalités de télétravail (2 à 3 jours par semaine), indemnité forfaitaire de 2,50 € nets par jour et obligation de tunnel VPN sécurisé.",
    impactIfModified: "MODÉRÉ",
    lastAuditDate: "12 Décembre 2025",
  },
  {
    id: "node-convoi-goma",
    title: "Protocole Opérationnel Convois Nord-Kivu",
    category: "Directive Mission",
    classification: "C4",
    theater: "Hub Opérationnel d'Urgence - Goma",
    version: "v1.4",
    dependenciesUpstream: ["node-sop-sec", "node-sphere"],
    dependenciesDownstream: [],
    summary: "Application locale pour les déplacements entre Goma et Rutshuru : 2 véhicules blindés légers, géolocalisation Garmin InReach toutes les 15 minutes et couvre-feu à 18h00.",
    impactIfModified: "ÉLEVÉ",
    lastAuditDate: "28 Février 2026",
  },
  {
    id: "node-contrat-wash",
    title: "Contrat-Cadre Approvisionnement en Eau & Pompes",
    category: "Contrat & Bailleurs",
    classification: "C3",
    theater: "Bureau Régional Sahel - Dakar",
    version: "v2.1",
    dependenciesUpstream: ["node-sphere", "node-usaid-echo"],
    dependenciesDownstream: [],
    summary: "Marché pluriannuel de fournitures de kits WASH d'urgence (valeur 180 000 USD) soumis à l'accord préalable de non-objection USAID et aux spécifications Sphère.",
    impactIfModified: "ÉLEVÉ",
    lastAuditDate: "01 Mars 2026",
  },
];

const SIMULATION_SCENARIOS = [
  {
    id: "sim-1",
    title: "Abaissement du seuil d'appel d'offres USAID (50k$ → 30k$)",
    triggerNode: "node-usaid-echo",
    affectedIds: ["node-contrat-wash", "node-achats-sahel"],
    severity: "CRITIQUE",
    analysis:
      "La baisse de ce seuil oblige à relancer 14 consultations de marché sous forme d'appels d'offres internationaux ouverts au lieu de procédures négociées. Délai de mise en conformité : 15 jours ouvrés.",
  },
  {
    id: "sim-2",
    title: "Passage au Niveau Orange (Menace Imminente) sur le Hub de Goma",
    triggerNode: "node-sop-sec",
    affectedIds: ["node-convoi-goma", "node-safe-room"],
    severity: "CRITIQUE",
    analysis:
      "Gel immédiat de tous les convois non vitaux vers les bases secondaires. Confinement préventif dans les Safe Rooms et bascule des communications sur radios HF Codan et téléphones Iridium.",
  },
  {
    id: "sim-3",
    title: "Révision de la norme Sphère sur l'eau d'urgence (15L → 20L/j)",
    triggerNode: "node-sphere",
    affectedIds: ["node-sop-sec", "node-contrat-wash", "node-convoi-goma"],
    severity: "ÉLEVÉ",
    analysis:
      "Nécessite une augmentation de 33% de la flotte de camions-citernes (Water Trucking) et un avenant immédiat sur le contrat-cadre d'approvisionnement hydraulique au Sahel.",
  },
];

export default function KnowledgeGraphPage() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("node-sphere");
  const [selectedCategory, setSelectedCategory] = useState<string>("TOUS");
  const [activeSimulation, setActiveSimulation] = useState<typeof SIMULATION_SCENARIOS[0] | null>(null);

  const selectedNode = NODES.find((n) => n.id === selectedNodeId) || NODES[0];

  const upstreamDocs = NODES.filter((n) => selectedNode.dependenciesUpstream.includes(n.id));
  const downstreamDocs = NODES.filter((n) => selectedNode.dependenciesDownstream.includes(n.id));

  const filteredNodes =
    selectedCategory === "TOUS" ? NODES : NODES.filter((n) => n.category === selectedCategory);

  function exportGraphCsv() {
    const headers = ["ID", "Titre", "Categorie", "Classification", "Theatre", "Dependances_Amont", "Dependances_Aval", "Impact_Modification"];
    const rows = NODES.map((n) => [
      n.id,
      `"${n.title}"`,
      n.category,
      n.classification,
      `"${n.theater}"`,
      `"${n.dependenciesUpstream.join(", ")}"`,
      `"${n.dependenciesDownstream.join(", ")}"`,
      n.impactIfModified,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const encoded = encodeURI(csvContent);
    const a = document.createElement("a");
    a.href = encoded;
    a.download = `misaina_knowledge_relations_${Date.now()}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-serif">
              Cartographie & Relations Documentaires
            </h1>
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-medium text-primary">
              <Network size={12} /> Knowledge Graph Actif
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-sans">
            Graphe de dépendances réglementaires, filiation des normes internationales et analyse d&apos;impact des révisions en cascade.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportGraphCsv} className="text-xs">
            <Download size={14} /> Exporter la matrice (.csv)
          </Button>
          <Link href="/chat">
            <Button size="sm" className="text-xs shadow-xs">
              <Sparkles size={14} /> Interroger le Graphe dans le Chat
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Documents interconnectés"
          value={NODES.length}
          trend="100% cartographiés"
          hint="Filiation vérifiée"
          icon={Layers}
        />
        <DashboardCard
          title="Liaisons de dépendance"
          value="18 relations"
          trend="Impact bidirectionnel"
          hint="Traçabilité descendante"
          icon={GitBranch}
        />
        <DashboardCard
          title="Pôle le plus influent"
          value="Standards Sphère"
          trend="Régit 5 directives"
          hint="Norme socle"
          icon={Compass}
        />
        <DashboardCard
          title="Sécurité PSSI C3/C4"
          value="4 documents"
          trend="Cloisonnement strict"
          hint="Protection Zero Trust"
          icon={ShieldCheck}
        />
      </div>

      {/* Interactive Simulation Strip */}
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles size={15} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                Simulateur d&apos;Impact de Révision Réglementaire
              </h3>
              <p className="text-xs text-muted-foreground">
                Visualisez immédiatement les procédures filles à réviser lorsqu&apos;une norme internationale est modifiée.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SIMULATION_SCENARIOS.map((sim) => (
              <button
                key={sim.id}
                onClick={() => {
                  setActiveSimulation(activeSimulation?.id === sim.id ? null : sim);
                  setSelectedNodeId(sim.triggerNode);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeSimulation?.id === sim.id
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "border border-border bg-card hover:bg-muted text-foreground"
                }`}
              >
                {sim.title}
              </button>
            ))}
          </div>
        </div>

        {activeSimulation && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <AlertTriangle size={14} /> Diagnostic d&apos;impact : {activeSimulation.title}
              </span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/20">
                Sévérité : {activeSimulation.severity}
              </span>
            </div>
            <p className="text-amber-800 dark:text-amber-200 leading-relaxed font-sans">
              {activeSimulation.analysis}
            </p>
            <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-amber-700 dark:text-amber-300">
              <span>Procédures impactées en cascade :</span>
              <span className="font-bold underline">{activeSimulation.affectedIds.length} textes formels</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Graph Grid (Left: Interactive Visual Nodes Matrix, Right: Inspector Card) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Nodes Catalog / Interactive Visual Matrix (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-muted-foreground font-medium px-1 flex items-center gap-1">
              <Filter size={12} /> Filtrer :
            </span>
            {["TOUS", "Norme Fondamentale", "SOP Opérationnel", "Politique PSSI", "Contrat & Bailleurs"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap text-xs ${
                  selectedCategory === cat
                    ? "bg-foreground text-background font-semibold"
                    : "border border-border/70 bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Interactive Nodes List */}
          <div className="space-y-2.5">
            {filteredNodes.map((node) => {
              const isSelected = selectedNodeId === node.id;
              const isSimAffected = activeSimulation?.affectedIds.includes(node.id);
              const isSimTrigger = activeSimulation?.triggerNode === node.id;

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/[0.04] shadow-sm ring-1 ring-primary/30"
                      : isSimAffected
                      ? "border-amber-500/70 bg-amber-500/5 animate-pulse"
                      : "border-border/80 bg-card hover:border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-serif font-semibold text-sm text-foreground">
                          {node.title}
                        </span>
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded border border-border bg-muted/60 text-muted-foreground">
                          {node.classification}
                        </span>
                        <span className="text-[10px] font-mono text-primary font-semibold">
                          {node.version}
                        </span>
                        {isSimTrigger && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-primary/20 text-primary">
                            Origine Révision
                          </span>
                        )}
                        {isSimAffected && (
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            Impacté
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground line-clamp-2 font-sans">
                        {node.summary}
                      </p>
                    </div>

                    <ArrowRight
                      size={16}
                      className={`shrink-0 transition-transform ${
                        isSelected ? "text-primary translate-x-1" : "text-muted-foreground/50"
                      }`}
                    />
                  </div>

                  {/* Badges strip */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-3 mt-3 border-t border-border/50">
                    <span className="font-medium">{node.category}</span>
                    <div className="flex items-center gap-3 font-mono text-[10px]">
                      <span>{node.dependenciesUpstream.length} amont</span>
                      <span>·</span>
                      <span className="text-primary font-semibold">{node.dependenciesDownstream.length} avals impactés</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Node Deep Inspector (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-20 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="space-y-2 border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-primary">
                  {selectedNode.category}
                </span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">
                  Habilitation {selectedNode.classification}
                </span>
              </div>

              <h2 className="font-serif text-lg font-bold text-foreground leading-snug">
                {selectedNode.title}
              </h2>

              <p className="text-xs text-muted-foreground font-sans">
                Théâtre : <span className="font-medium text-foreground">{selectedNode.theater}</span> · Version <span className="font-mono">{selectedNode.version}</span>
              </p>
            </div>

            {/* Filiation & Upstream Dependencies */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground block">
                1. Textes & Normes Socles Amont (Parents) :
              </span>
              {upstreamDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic bg-muted/30 p-2.5 rounded-xl">
                  Norme racine première (aucun texte amont imposé).
                </p>
              ) : (
                <div className="space-y-1.5">
                  {upstreamDocs.map((up) => (
                    <div
                      key={up.id}
                      onClick={() => setSelectedNodeId(up.id)}
                      className="cursor-pointer rounded-xl border border-border/80 bg-muted/30 p-2.5 hover:border-primary/50 text-xs transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium text-foreground truncate pr-2">{up.title}</span>
                      <span className="font-mono text-[10px] text-primary shrink-0">{up.version}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Downstream Dependencies */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground block">
                2. Dépendances & Procédures Aval Impactées (Filles) :
              </span>
              {downstreamDocs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic bg-muted/30 p-2.5 rounded-xl">
                  Document terminal de terrain (aucune procédure fille dépendante).
                </p>
              ) : (
                <div className="space-y-1.5">
                  {downstreamDocs.map((down) => (
                    <div
                      key={down.id}
                      onClick={() => setSelectedNodeId(down.id)}
                      className="cursor-pointer rounded-xl border border-border/80 bg-primary/5 p-2.5 hover:border-primary text-xs transition-colors flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-semibold text-foreground truncate">{down.title}</p>
                        <p className="text-[10px] text-muted-foreground">{down.category}</p>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                        Révision exigée
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-xl bg-muted/40 p-3.5 space-y-1 text-xs">
              <span className="font-semibold text-foreground block">Synthèse Réglementaire</span>
              <p className="text-muted-foreground leading-relaxed font-sans">
                {selectedNode.summary}
              </p>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <Link href="/chat">
                <Button className="w-full text-xs shadow-xs">
                  <Sparkles size={14} /> Poser une question sur ce référentiel
                </Button>
              </Link>
              <Link href="/documents">
                <Button variant="outline" className="w-full text-xs">
                  <FileText size={14} /> Consulter dans la Base Documentaire
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
