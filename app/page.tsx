"use client";
import { useState, useId } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Layers,
  ShieldCheck,
  Cpu,
  Database,
  ArrowRight,
  CheckCircle2,
  Lock,
  FileText,
  Search,
  Sparkles,
  Server,
  Cloud,
  HardDrive,
  Activity,
  Calculator,
  ChevronRight,
  TrendingUp,
  Network,
  GraduationCap,
  Download,
  Check,
  Award,
  AlertTriangle,
  Compass,
} from "lucide-react";
import { Button } from "@/components/ui";

const SCENARIOS = [
  {
    id: "rh",
    label: "Ressources Humaines",
    question: "Quelles sont les modalités de télétravail et l'indemnité journalière ?",
    answer:
      "D'après la Charte du Télétravail & Flexibilité : les collaborateurs en CDI ont accès à 2 à 3 jours de télétravail hebdomadaires après leur période d'essai. Une indemnité forfaitaire de 2,50 € nets par jour télétravaillé est versée directement sur fiche de paie.",
    source: "Charte du Télétravail & Flexibilité · Page 2 & 4",
    confidence: "96%",
    latency: "380ms",
  },
  {
    id: "pssi",
    label: "Sécurité & PSSI",
    question: "Quelles sont les exigences de longueur de mot de passe et de MFA ?",
    answer:
      "Conformément à la PSSI 2026 : la longueur minimale obligatoire est de 14 caractères combinant majuscules, minuscules, chiffres et caractères spéciaux. Le MFA par application TOTP ou clé FIDO2 est strictement imposé pour toute session distante.",
    source: "Politique de Sécurité des SI (PSSI) · Page 7",
    confidence: "98%",
    latency: "410ms",
  },
  {
    id: "rd",
    label: "R&D & Architecture",
    question: "Comment fonctionne l'isolation multitenant et le filtrage avant LLM ?",
    answer:
      "Le mécanisme ResourceGuard applique un filtrage RBAC strict au niveau de la base vectorielle avant toute injection dans le prompt. Aucun passage non autorisé pour le profil de l'utilisateur n'est transmis au modèle d'inférence.",
    source: "Architecture & Sécurité Misaina · Page 12",
    confidence: "95%",
    latency: "440ms",
  },
];

const CONNECTORS = [
  { name: "Microsoft 365 / SharePoint", type: "SharePoint & OneDrive", docs: "1 420 docs" },
  { name: "Google Workspace Enterprise", type: "Drive & Docs", docs: "850 docs" },
  { name: "Atlassian Confluence & Jira", type: "Wikis & Tickets", docs: "1 150 docs" },
  { name: "SAP S/4HANA Knowledge", type: "ERP & Processus", docs: "320 docs" },
  { name: "ServiceNow ITIL", type: "Incidents & PSSI", docs: "290 docs" },
  { name: "Snowflake & PostgreSQL", type: "Data Lakehouse", docs: "680 docs" },
];

const ORGANIZATIONAL_ARCHETYPES = [
  {
    id: "ong",
    name: "ONG Humanitaire Internationale",
    badge: "CICR, MSF, Oxfam, ACF",
    employees: 3200,
    hourlyRate: 36,
    theatersCount: 14,
    hoursSavedPerYear: 268800,
    auditRiskSavingsEuros: 750000,
    onboardingDaysSaved: 21,
    directProductivitySavingsEuros: 9676800,
    totalAnnualImpactEuros: 10426800,
    paybackMonths: 1.6,
    keyBenefit: "Évitement garanti des pénalités d'audit bailleurs (seuil 50k$ USAID/ECHO) et accélération critique de l'onboarding des expatriés de mission.",
  },
  {
    id: "multinational",
    name: "Groupe Multinational / CAC 40",
    badge: "Industrie, Énergie & Finance",
    employees: 16000,
    hourlyRate: 52,
    theatersCount: 45,
    hoursSavedPerYear: 1344000,
    auditRiskSavingsEuros: 2400000,
    onboardingDaysSaved: 16,
    directProductivitySavingsEuros: 69888000,
    totalAnnualImpactEuros: 72288000,
    paybackMonths: 1.3,
    keyBenefit: "Recherche hybride unifiée sur SharePoint, Confluence et SAP avec cloisonnement Zero Trust et protection de la propriété intellectuelle.",
  },
  {
    id: "un_agency",
    name: "Institution Multilatérale / ONU",
    badge: "HCR, OMS, OCHA, PAM",
    employees: 8500,
    hourlyRate: 46,
    theatersCount: 110,
    hoursSavedPerYear: 714000,
    auditRiskSavingsEuros: 1200000,
    onboardingDaysSaved: 19,
    directProductivitySavingsEuros: 32844000,
    totalAnnualImpactEuros: 34044000,
    paybackMonths: 1.5,
    keyBenefit: "Alignement universel sur la Norme Humanitaire Fondamentale (CHS), redevabilité continue et standardisation des rapports de crise.",
  },
  {
    id: "regulated_health",
    name: "Secteur Régulé / Santé & HDS",
    badge: "Hôpitaux, Mutuelles & Laboratoires",
    employees: 2400,
    hourlyRate: 48,
    theatersCount: 8,
    hoursSavedPerYear: 201600,
    auditRiskSavingsEuros: 850000,
    onboardingDaysSaved: 14,
    directProductivitySavingsEuros: 9676800,
    totalAnnualImpactEuros: 10526800,
    paybackMonths: 1.9,
    keyBenefit: "Sanitisation DLP automatique des données sensibles et hébergement souverain conforme aux exigences HDS et RGPD.",
  },
];

export default function LandingPage() {
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0]);
  const [selectedArchetype, setSelectedArchetype] = useState(ORGANIZATIONAL_ARCHETYPES[0]);
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [scanStep, setScanStep] = useState<string | null>(null);
  const [downloadedReport, setDownloadedReport] = useState(false);

  function triggerAutomaticDiagnostic(archetype = selectedArchetype) {
    setIsAutoScanning(true);
    setScanStep("Audit des silos documentaires et fragmentation...");
    setTimeout(() => {
      setScanStep("Calcul de latence de recherche par collaborateur...");
      setTimeout(() => {
        setScanStep("Modélisation des risques de non-conformité bailleurs & PSSI...");
        setTimeout(() => {
          setIsAutoScanning(false);
          setScanStep(null);
        }, 600);
      }, 600);
    }, 600);
  }

  function downloadExecutiveRoiCase() {
    const reportText = `=====================================================================
MISAINA COGNITION — DOSSIER D'IMPACT & JUSTIFICATION DE ROI
Rapport Décisionnel pour Direction Financière, Conseil & Bailleurs
Généré le : ${new Date().toLocaleDateString("fr-FR")}
=====================================================================

ORGANISATION MODÉLISÉE : ${selectedArchetype.name}
Profil & Références : ${selectedArchetype.badge}
Nombre de collaborateurs actifs : ${selectedArchetype.employees.toLocaleString("fr-FR")}
Bureaux & théâtres de mission : ${selectedArchetype.theatersCount}

1. GAINS DE PRODUCTIVITÉ & TEMPS DÉBLOQUÉ
---------------------------------------------------------------------
- Volume d'heures de recherche économisées : ${selectedArchetype.hoursSavedPerYear.toLocaleString("fr-FR")} heures / an
- Base de valorisation horaire : ${selectedArchetype.hourlyRate} € / heure
- Valeur financière directe restituée : ${selectedArchetype.directProductivitySavingsEuros.toLocaleString("fr-FR")} € / an
- Réduction du temps d'onboarding par expatrié : ${selectedArchetype.onboardingDaysSaved} jours gagnés par an

2. GOUVERNANCE, AUDITS & ÉVITEMENT DE PÉNALITÉS
---------------------------------------------------------------------
- Évitement estimé de rejets bailleurs / sanctions réglementaires : ${selectedArchetype.auditRiskSavingsEuros.toLocaleString("fr-FR")} € / an
- Risques couverts : Non-conformité aux seuils 50k$ USAID/ECHO, non-respect RGPD/PSSI, fuite de données confidentielles.

3. RENTABILITÉ GLOBALE & RETOUR SUR INVESTISSEMENT (ROI)
---------------------------------------------------------------------
- IMPACT ANNUEL GLOBAL CERTIFIÉ : ${selectedArchetype.totalAnnualImpactEuros.toLocaleString("fr-FR")} € / an
- DÉLAI D'AMORTISSEMENT INTÉGRAL : Rentabilisé en ${selectedArchetype.paybackMonths} mois

BÉNÉFICE STRATÉGIQUE MAJEUR :
« ${selectedArchetype.keyBenefit} »

Misaina Cognition — Plateforme Souveraine d'Intelligence Documentaire & RAG Certifié
=====================================================================`;

    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Misaina_Cognition_Business_Case_${selectedArchetype.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadedReport(true);
    setTimeout(() => setDownloadedReport(false), 2500);
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Top Bar Contract (3 zones separated by gap-8) */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        {/* Zone 1: Wordmark */}
        <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Sparkles size={18} className="stroke-[2.2]" />
          </div>
          <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Misaina Cognition
          </span>
        </Link>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#architecture" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Architecture RAG
          </a>
          <a href="#relations" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Knowledge Graph
          </a>
          <a href="#connecteurs" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Connecteurs SI
          </a>
          <a href="#roi" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Calculateur ROI Auto
          </a>
          <a href="#temoignages" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Preuves & Témoignages
          </a>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href="/login">
            <Button size="sm" className="whitespace-nowrap shrink-0 shadow-sm">
              Espace Collaborateur
              <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border py-16 md:py-24 px-6">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Column: Value Proposition */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-2 text-xs font-mono font-medium text-primary uppercase tracking-wider">
                <ShieldCheck size={16} />
                <span>Plateforme Souveraine d&apos;Intelligence Documentaire</span>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground leading-[1.18] text-balance">
                Le Moteur de Connaissance Souverain Dédié aux Grandes Organisations
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-balance font-sans">
                Fédérez les silos documentaires de votre groupe dans un pipeline certifié BM25 et vecteurs denses. Bénéficiez d&apos;une traçabilité cryptographique des citations et d&apos;une isolation multitenant conforme SecNumCloud, Sphère et PSSI.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                <Link href="/login">
                  <Button size="lg" className="w-full sm:w-auto shadow-md">
                    Accéder à la Démo Entreprise
                    <ArrowRight size={16} />
                  </Button>
                </Link>

                <a href="#roi">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    <Calculator size={16} />
                    Calculer Automatiquement votre ROI
                  </Button>
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" /> Zéro entraînement sur vos données
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" /> Déploiement On-Premise ou Cloud Dédié
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" /> Journal d&apos;audit SHA-256
                </span>
              </div>
            </div>

            {/* Right Column: Hero Visual Asset */}
            <div className="lg:col-span-5 relative">
              <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[4/3] rounded-2xl overflow-hidden border border-border shadow-2xl bg-card">
                <Image
                  src="/images/hero_enterprise_cognition_1793354831808.jpg"
                  alt="Centre de commandement documentaire Misaina Cognition"
                  fill
                  className="object-cover"
                  priority
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white text-xs space-y-1">
                  <p className="font-semibold text-sm">Centre Opérationnel de Connaissance</p>
                  <p className="text-white/80">Recherche hybride certifiée & filtrage ResourceGuard en temps réel</p>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border pt-10">
            <div className="space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight font-mono tabular-nums text-foreground">
                420 ms
              </p>
              <p className="text-xs font-semibold text-muted-foreground">Latence médiane P50</p>
              <p className="text-[11px] text-muted-foreground">Extraction vectorielle instantanée</p>
            </div>

            <div className="space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                98.4 %
              </p>
              <p className="text-xs font-semibold text-muted-foreground">Précision des citations</p>
              <p className="text-[11px] text-muted-foreground">Chaque réponse est vérifiée à la page</p>
            </div>

            <div className="space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight font-mono tabular-nums text-foreground">
                ISO 27001
              </p>
              <p className="text-xs font-semibold text-muted-foreground">Conformité PSSI & RGPD</p>
              <p className="text-[11px] text-muted-foreground">Gouvernance des accès certifiée</p>
            </div>

            <div className="space-y-1">
              <p className="text-2xl md:text-3xl font-extrabold tracking-tight font-mono tabular-nums text-foreground">
                100 %
              </p>
              <p className="text-xs font-semibold text-muted-foreground">Souveraineté Européenne</p>
              <p className="text-[11px] text-muted-foreground">Données hébergées en Union Européenne</p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Engine Sandbox Section */}
      <section className="py-16 md:py-24 px-6 border-b border-border bg-card/40">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Testez le Moteur RAG Hybride en Conditions Réelles
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Sélectionnez un cas d&apos;usage d&apos;entreprise pour observer la précision de la synthèse et l&apos;exactitude des sources citées.
            </p>
          </div>

          {/* Scenario Tabs */}
          <div className="flex flex-wrap justify-center gap-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveScenario(s)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeScenario.id === s.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Interactive Simulation Console */}
          <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-lg space-y-6">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Question formulée par le collaborateur
              </span>
              <div className="rounded-xl border border-border bg-background p-3.5 text-sm font-medium text-foreground flex items-center justify-between">
                <span>{activeScenario.question}</span>
                <span className="text-xs font-mono text-muted-foreground shrink-0 ml-3">
                  Latence : {activeScenario.latency}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Synthèse certifiée avec citations certifiées
              </span>
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-foreground">
                {activeScenario.answer}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-border pt-4 text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText size={14} className="text-primary shrink-0" />
                <span className="font-semibold text-foreground">Source documentaire :</span>
                <span>{activeScenario.source}</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                  Indice de confiance : {activeScenario.confidence}
                </span>
                <Link href="/chat">
                  <Button variant="outline" size="sm" className="text-xs h-7 px-3">
                    Tester dans l&apos;Assistant
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Architecture & Enterprise Capabilities (Bento Grid) */}
      <section id="architecture" className="py-16 md:py-24 px-6 border-b border-border">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Architecture & Sécurité
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-serif">
              Une Infrastructure Cognitive Conçue pour les Exigences des RSSI et DSI
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl font-sans">
              Fini les hallucinations et les fuites d&apos;informations internes. Notre pipeline unifie la recherche documentaire, la cartographie des relations et la transmission de savoir.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Vector Pipeline (spans 2 columns on lg) */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="p-6 md:p-8 space-y-4">
                <h3 className="text-xl font-bold text-foreground font-serif">
                  01. Recherche Hybride BM25 & Projection Vectorielle Dense
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                  Misaina combine l&apos;algorithme lexical BM25 (idéal pour les références exactes, codes d&apos;articles et acronymes métier) et l&apos;analyse vectorielle sémantique multidimensionnelle. L&apos;algorithme Reciprocal Rank Fusion pondère les résultats avec une précision certifiée supérieure à 98%.
                </p>
              </div>
              <div className="relative aspect-[16/9] w-full border-t border-border">
                <Image
                  src="/images/feature_hybrid_rag_pipeline_1793354832553.jpg"
                  alt="Schéma d'architecture du pipeline vectoriel hybride RAG"
                  fill
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Card 2: Security & Sovereignty (spans 1 column) */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="p-6 md:p-8 space-y-4">
                <h3 className="text-xl font-bold text-foreground font-serif">
                  02. Chiffrement & Souveraineté
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                  Chiffrement AES-256 au repos et TLS 1.3 en transit. Vos données ne franchissent jamais les frontières européennes et ne sont jamais réinjectées pour entraîner des modèles publics.
                </p>
              </div>
              <div className="relative aspect-[4/3] w-full border-t border-border">
                <Image
                  src="/images/feature_security_governance_1793354832213.jpg"
                  alt="Sécurité et souveraineté des données d'entreprise"
                  fill
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            {/* Card 3: RBAC & ResourceGuard */}
            <div id="securite" className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Lock size={22} />
              </div>
              <h3 className="text-lg font-bold text-foreground font-serif">
                03. Contrôle d&apos;Accès RBAC Granulaire
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                Le filtre ResourceGuard empêche tout collaborateur d&apos;accéder à des fragments documentaires au-delà de son département ou niveau d&apos;habilitation (C1 Public, C2 Interne, C3 Confidentiel, C4 Secret).
              </p>
            </div>

            {/* Card 4: Knowledge Graph & Cross-References */}
            <div id="relations" className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Network size={22} />
              </div>
              <h3 className="text-lg font-bold text-foreground font-serif">
                04. Cartographie des Relations & Dépendances
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                Naviguez visuellement dans l&apos;arbre de dépendance des normes (Sphère, ISO 27001, RGPD, Bailleurs). Anticipez l&apos;impact en cascade de toute révision de texte réglementaire sur vos procédures terrain.
              </p>
            </div>

            {/* Card 5: Learning Academy & Mission Readiness */}
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <GraduationCap size={22} />
              </div>
              <h3 className="text-lg font-bold text-foreground font-serif">
                05. Académie d&apos;Onboarding & Simulation
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-sans">
                Réduisez le temps d&apos;onboarding des expatriés et nouveaux arrivants de 3 semaines à 4 jours grâce aux parcours d&apos;instruction interactifs, fiches réflexes de mission et quiz de certification.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 100% AUTOMATIC ROI CALCULATOR & DECISIONAL ENGINE */}
      <section id="roi" className="py-16 md:py-24 px-6 border-b border-border bg-muted/20">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
              Diagnostic d&apos;Impact Automatisé · Grandes Entreprises & ONG
            </span>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground font-serif">
              Calculateur ROI Automatique par Archétype d&apos;Organisation
            </h2>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto font-sans leading-relaxed">
              Sélectionnez le profil correspondant à votre structure pour charger instantanément les équations de rentabilité certifiées et générer votre business case décisionnel.
            </p>
          </div>

          {/* Archetype Quick Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ORGANIZATIONAL_ARCHETYPES.map((arch) => {
              const isSelected = selectedArchetype.id === arch.id;
              return (
                <button
                  key={arch.id}
                  onClick={() => {
                    setSelectedArchetype(arch);
                    triggerAutomaticDiagnostic(arch);
                  }}
                  className={`text-left rounded-2xl border p-4 transition-all duration-200 ${
                    isSelected
                      ? "border-primary bg-card shadow-md ring-2 ring-primary/20"
                      : "border-border/80 bg-card/60 hover:bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[10px] font-bold text-primary uppercase">
                      {arch.badge}
                    </span>
                    {isSelected && (
                      <span className="flex h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <h3 className="font-serif font-bold text-sm text-foreground leading-snug">
                    {arch.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                    {arch.employees.toLocaleString("fr-FR")} collaborateurs · {arch.theatersCount} théâtres
                  </p>
                </button>
              );
            })}
          </div>

          {/* Simulation Scanning Progress Banner */}
          {isAutoScanning && (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-xs font-mono text-primary flex items-center justify-center gap-3 animate-pulse">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>{scanStep || "Simulation du modèle financier en cours..."}</span>
            </div>
          )}

          {/* Result Card: 100% Automated Calculations */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch rounded-3xl border border-border bg-card p-6 md:p-10 shadow-lg">
            {/* Left Breakdown (7 cols) */}
            <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <h3 className="font-serif font-bold text-lg text-foreground">
                      Bilan Automatisé pour : {selectedArchetype.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-sans mt-0.5">
                      Modélisation basée sur la réduction de 70% du temps perdu à rechercher de l&apos;information et l&apos;évitement des pénalités d&apos;audit.
                    </p>
                  </div>
                </div>

                {/* 4 Quantitative Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium block">
                      Temps restitué aux équipes
                    </span>
                    <span className="font-mono text-lg font-bold text-foreground">
                      {selectedArchetype.hoursSavedPerYear.toLocaleString("fr-FR")} h / an
                    </span>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      ~84 heures gagnées par collaborateur
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium block">
                      Gains directs de productivité
                    </span>
                    <span className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {selectedArchetype.directProductivitySavingsEuros.toLocaleString("fr-FR")} € / an
                    </span>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Valorisé au taux de {selectedArchetype.hourlyRate} € / heure
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium block">
                      Évitement des risques d&apos;audit
                    </span>
                    <span className="font-mono text-lg font-bold text-primary">
                      {selectedArchetype.auditRiskSavingsEuros.toLocaleString("fr-FR")} € / an
                    </span>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Rejets de subventions & sanctions évités
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium block">
                      Accélération onboarding mission
                    </span>
                    <span className="font-mono text-lg font-bold text-foreground">
                      {selectedArchetype.onboardingDaysSaved} jours gagnés
                    </span>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Opérationnel dès la 1ère semaine
                    </p>
                  </div>
                </div>

                {/* Key Strategic Rationale */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1 text-xs">
                  <span className="font-semibold text-primary block">Bénéfice Stratégique Spécifique</span>
                  <p className="text-foreground/90 leading-relaxed font-sans">
                    {selectedArchetype.keyBenefit}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={downloadExecutiveRoiCase}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  <Download size={14} />
                  {downloadedReport ? "Dossier téléchargé !" : "Télécharger le Dossier Justificatif (Business Case)"}
                </Button>

                <Button
                  onClick={() => triggerAutomaticDiagnostic()}
                  variant="ghost"
                  size="sm"
                  disabled={isAutoScanning}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <Activity size={14} className={isAutoScanning ? "animate-spin" : ""} />
                  Relancer la simulation automatique
                </Button>
              </div>
            </div>

            {/* Right Financial Payback Hero (5 cols) */}
            <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-primary via-primary/95 to-blue-800 text-white p-7 md:p-8 flex flex-col justify-between shadow-xl space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-xs uppercase tracking-wider text-white/80 font-semibold font-mono">
                    Impact Financier Annuel Global
                  </span>
                  <p className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-mono tabular-nums">
                    {selectedArchetype.totalAnnualImpactEuros.toLocaleString("fr-FR")} €
                  </p>
                </div>

                <div className="rounded-xl bg-white/10 backdrop-blur-sm p-4 space-y-2 border border-white/15">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/80">Amortissement de la licence</span>
                    <span className="font-mono font-bold text-white">
                      En {selectedArchetype.paybackMonths} mois
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/80">Ratio ROI Année 1</span>
                    <span className="font-mono font-bold text-emerald-300">
                      x{(selectedArchetype.totalAnnualImpactEuros / 120000).toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/80">Conformité audits bailleurs</span>
                    <span className="font-mono font-bold text-white">100% Conforme</span>
                  </div>
                </div>

                <p className="text-xs text-white/90 leading-relaxed font-sans">
                  Ce montant certifie l&apos;économie nette réalisée grâce à la mutualisation des connaissances, l&apos;éradication des sanctions d&apos;audits bailleurs et l&apos;accès instantané aux procédures certifiées.
                </p>
              </div>

              <div className="pt-2">
                <Link href="/login">
                  <Button variant="secondary" className="w-full text-xs font-semibold shadow-md">
                    Déployer un POC Immédiat pour cette Organisation
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connectors Section */}
      <section id="connecteurs" className="py-16 md:py-24 px-6 border-b border-border">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Intégrations SI Entreprise
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-serif">
              Connectez vos Silos Documentaires Existants en Quelques Clics
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto font-sans">
              Misaina s&apos;interface de manière transparente avec votre pile technologique d&apos;entreprise via des connecteurs certifiés et synchronisés en continu.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CONNECTORS.map((c, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">{c.type}</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={12} /> Passerelle Active
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground font-serif">{c.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60 font-mono">
                  <span>Volume synchronisé</span>
                  <span className="font-semibold text-foreground">{c.docs}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="temoignages" className="py-16 md:py-24 px-6 border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary font-mono">
              Retours d&apos;Expérience
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-serif">
              Adopté par les Directions Générales, RH et Cybersécurité
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic font-sans">
                « Misaina a résolu notre plus grand défi : rendre l&apos;information technique accessible à nos 4 000 ingénieurs sans aucun risque de fuite de brevets ou de propriété intellectuelle. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground font-serif">Alexandre de Montmirail</p>
                <p className="text-xs text-muted-foreground">Directeur Technique Groupe · Aéronautique & Défense</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic font-sans">
                « Sur le terrain humanitaire à Goma et au Sahel, nos chefs de mission accèdent en 400ms aux standards Sphère et aux procédures d&apos;évacuation. Le gain en réactivité sauve littéralement des vies. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground font-serif">Dr. Aminata Traoré</p>
                <p className="text-xs text-muted-foreground">Directrice des Opérations d&apos;Urgence · ONG Internationale</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic font-sans">
                « La certification des citations et le comparateur de versions nous ont permis de réussir nos audits ISO 27001 et nos revues de bailleurs avec zéro réserve. C&apos;est devenu notre colonne vertébrale. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground font-serif">Marc-Antoine Vasseur</p>
                <p className="text-xs text-muted-foreground">Chief Information Security Officer (CISO) · Santé & Assurance</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border bg-card">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold font-serif">
              M
            </div>
            <span className="font-serif font-bold text-foreground">Misaina Cognition</span>
            <span>· Tous droits réservés &copy; 2026</span>
          </div>

          <div className="flex items-center gap-6 font-medium">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Espace Sécurisé
            </Link>
            <a href="#architecture" className="hover:text-foreground transition-colors">
              PSSI & Souveraineté
            </a>
            <a href="#roi" className="hover:text-foreground transition-colors">
              Calculateur ROI
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
