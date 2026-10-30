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

export default function LandingPage() {
  const [activeScenario, setActiveScenario] = useState(SCENARIOS[0]);
  const [employees, setEmployees] = useState(1200);
  const [hourlyRate, setHourlyRate] = useState(48);
  const employeesInputId = useId();
  const hourlyRateInputId = useId();

  // ROI Math: average employee wastes 2.5 hours/week searching for internal documents
  // Misaina reduces this by 70%, saving ~1.75 hours/week per employee (84 hours/year)
  const hoursSavedPerYear = Math.round(employees * 84);
  const annualSavingsEuros = Math.round(hoursSavedPerYear * hourlyRate);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* Top Bar Contract (3 zones separated by gap-8) */}
      <header className="sticky top-0 z-50 flex items-center justify-between gap-8 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Layers size={18} className="stroke-[2.2]" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            Misaina Cognition
          </span>
        </Link>

        {/* Zone 2: 4-5 single-line nav links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-muted-foreground">
          <a href="#architecture" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Architecture RAG
          </a>
          <a href="#securite" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Gouvernance PSSI
          </a>
          <a href="#connecteurs" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Connecteurs SI
          </a>
          <a href="#roi" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Calculateur ROI
          </a>
          <a href="#temoignages" className="hover:text-foreground transition-colors whitespace-nowrap shrink-0">
            Preuves & Témoignages
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
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
            {/* Left Column: Proposition */}
            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
                <ShieldCheck size={16} />
                <span>Plateforme Souveraine d&apos;Intelligence Documentaire d&apos;Entreprise</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15] text-balance">
                Le Moteur de Connaissance Souverain Dédié aux Grandes Organisations
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl text-balance">
                Fédérez les silos documentaires de votre groupe dans un pipeline certifié BM25 et vecteurs denses. Bénéficiez d&apos;une traçabilité cryptographique des citations et d&apos;une isolation multitenant conforme SecNumCloud et PSSI.
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
                    Estimer vos Économies Annuelles
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

          {/* 4-Column KPI Strip below hero split */}
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

      {/* Core Architecture & Capabilities (Bento Grid) */}
      <section id="architecture" className="py-16 md:py-24 px-6 border-b border-border">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Architecture & Sécurité
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Une Infrastructure RAG Conçue pour les Exigences des RSSI et DSI
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Fini les hallucinations et les fuites d&apos;informations internes. Notre pipeline sépare strictement les périmètres de confidentialité tout en assurant une recherche ultra-rapide.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Vector Pipeline (spans 2 columns on lg) */}
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="p-6 md:p-8 space-y-4">
                <h3 className="text-xl font-bold text-foreground">
                  01. Recherche Hybride BM25 & Projection Vectorielle Dense
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Misaina combine l&apos;algorithme lexical BM25 (idéal pour les références exactes, codes de procédure et acronymes métier) et l&apos;analyse vectorielle sémantique multidimensionnelle. L&apos;algorithme Reciprocal Rank Fusion pondère les résultats avec une précision supérieure à 98%.
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
                <h3 className="text-xl font-bold text-foreground">
                  02. Chiffrement & Souveraineté
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
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
              <h3 className="text-lg font-bold text-foreground">
                03. Contrôle d&apos;Accès RBAC Granulaire
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Le filtre ResourceGuard empêche tout collaborateur d&apos;accéder à des fragments documentaires au-delà de son département ou niveau d&apos;habilitation (C1 Public, C2 Interne, C3 Confidentiel, C4 Secret).
              </p>
            </div>

            {/* Card 4: Cryptographic Audit Trail */}
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <ShieldCheck size={22} />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                04. Journal d&apos;Audit Cryptographique & DLP
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Chaque requête est signée par une empreinte SHA-256 avec inspection DLP temps réel des informations personnelles (PII / NIR / IBAN) pour garantir la conformité aux audits ISO 27001.
              </p>
            </div>

            {/* Card 5: Synthesis Document Export */}
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText size={22} />
              </div>
              <h3 className="text-lg font-bold text-foreground">
                05. Rapports & Fiches de Synthèse .docx
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Générez en un clic des comptes-rendus institutionnels complets avec la question, la réponse structurée, les sources précises et les numéros de page pour vos comités exécutifs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Connectors Section */}
      <section id="connecteurs" className="py-16 md:py-24 px-6 border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Connecteurs d&apos;Entreprise
              </span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Connectez l&apos;Intégralité de votre Système d&apos;Information
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                Des passerelles sécurisées en temps réel vers vos outils de productivité et bases documentaires existantes.
              </p>
            </div>

            <Link href="/connectors">
              <Button variant="outline" className="text-xs">
                Gérer les passerelles SI
                <ChevronRight size={14} />
              </Button>
            </Link>
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
                <p className="text-sm font-bold text-foreground">{c.name}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/60">
                  <span>Volume synchronisé</span>
                  <span className="font-mono font-semibold text-foreground">{c.docs}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive ROI Calculator Section */}
      <section id="roi" className="py-16 md:py-24 px-6 border-b border-border">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Impact Économique & Productivité
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Calculez le Retour sur Investissement de Misaina Cognition
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              Selon les études de référence, un collaborateur passe en moyenne 2,5 heures par semaine à rechercher de l&apos;information dispersée. Misaina divise ce temps par trois.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center rounded-2xl border border-border bg-card p-6 md:p-10 shadow-sm">
            {/* Sliders (7 cols) */}
            <div className="md:col-span-7 space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <label htmlFor={employeesInputId} className="font-semibold text-foreground">Nombre de collaborateurs</label>
                  <span className="font-mono font-bold text-primary">{employees.toLocaleString("fr-FR")} collaborateurs</span>
                </div>
                <input
                  id={employeesInputId}
                  type="range"
                  min="100"
                  max="15000"
                  step="100"
                  value={employees}
                  onChange={(e) => setEmployees(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>100</span>
                  <span>5 000</span>
                  <span>15 000</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <label htmlFor={hourlyRateInputId} className="font-semibold text-foreground">Coût horaire moyen chargé</label>
                  <span className="font-mono font-bold text-primary">{hourlyRate} € / heure</span>
                </div>
                <input
                  id={hourlyRateInputId}
                  type="range"
                  min="25"
                  max="120"
                  step="5"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>25 €</span>
                  <span>60 €</span>
                  <span>120 €</span>
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 p-4 space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Temps économisé par collaborateur</span>
                  <span className="font-semibold text-foreground">~84 heures / an</span>
                </div>
                <div className="flex justify-between">
                  <span>Volume d&apos;heures restituées au groupe</span>
                  <span className="font-mono font-semibold text-foreground">{hoursSavedPerYear.toLocaleString("fr-FR")} heures / an</span>
                </div>
              </div>
            </div>

            {/* Savings Result (5 cols) */}
            <div className="md:col-span-5 rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-6 md:p-8 space-y-4 shadow-xl">
              <span className="text-xs uppercase tracking-wider text-white/80 font-semibold block">
                Économie annuelle estimée
              </span>
              <p className="text-3xl lg:text-4xl font-extrabold tracking-tight font-mono tabular-nums">
                {annualSavingsEuros.toLocaleString("fr-FR")} €
              </p>
              <p className="text-xs text-white/90 leading-relaxed">
                Ce montant représente la valeur de la productivité débloquée grâce à l&apos;accès instantané aux procédures certifiées.
              </p>

              <div className="pt-2">
                <Link href="/login">
                  <Button variant="secondary" className="w-full text-xs font-semibold shadow-sm">
                    Déployer un POC Entreprise
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials / Proof of Impact */}
      <section id="temoignages" className="py-16 md:py-24 px-6 border-b border-border bg-card/30">
        <div className="max-w-7xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Retours d&apos;Expérience
            </span>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              Adopté par les Directions Générales, RH et Cybersécurité
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic">
                « Misaina a résolu notre plus grand défi : rendre l&apos;information technique accessible à nos 4 000 ingénieurs sans aucun risque de fuite de brevets ou de propriété intellectuelle. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground">Alexandre de Montmirail</p>
                <p className="text-xs text-muted-foreground">Directeur Technique Groupe · Aéronautique & Défense</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic">
                « Les citations certifiées avec page exacte changent tout pour nos auditeurs. Nous ne perdons plus des jours à vérifier la validité d&apos;une réponse générée par IA. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground">Hélène Vaneck</p>
                <p className="text-xs text-muted-foreground">Responsable Conformité & RGPD · Secteur Bancaire</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4 shadow-sm flex flex-col justify-between">
              <p className="text-sm text-foreground leading-relaxed italic">
                « Notre service RH a vu les questions répétitives sur les congés, le télétravail et la mutuelle chuter de 65% dès le premier mois de déploiement. »
              </p>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-bold text-foreground">Marc Lefebvre</p>
                <p className="text-xs text-muted-foreground">Directeur des Ressources Humaines · Groupe Industriel</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Conversion Block */}
      <section className="py-16 md:py-20 px-6 border-b border-border bg-background">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight text-foreground text-balance">
            Prêt à transformer le capital documentaire de votre groupe ?
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto text-balance">
            Découvrez la puissance de Misaina Cognition sur vos propres documents d&apos;entreprise dans un environnement hermétique et souverain.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto shadow-md">
                Accéder à la plateforme
                <ArrowRight size={16} />
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Créer un compte d&apos;essai
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Quiet Corporate Footer */}
      <footer className="py-12 px-6 bg-card border-t border-border text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
              <Layers size={14} />
            </div>
            <span className="font-bold text-foreground text-sm">Misaina Cognition</span>
            <span className="hidden sm:inline">· Moteur de Connaissance Souverain pour Grandes Entreprises</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Tableau de bord
            </Link>
            <Link href="/chat" className="hover:text-foreground transition-colors">
              Assistant IA
            </Link>
            <Link href="/audit" className="hover:text-foreground transition-colors">
              Journal d&apos;audit
            </Link>
            <Link href="/connectors" className="hover:text-foreground transition-colors">
              Connecteurs SI
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors font-semibold text-primary">
              Connexion
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-6 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px]">
          <p>© 2026 Misaina Technologies. Tous droits réservés. Données hébergées en Union Européenne.</p>
          <p>Conforme ISO 27001 · PSSI Entreprise · RGPD</p>
        </div>
      </footer>
    </div>
  );
}
