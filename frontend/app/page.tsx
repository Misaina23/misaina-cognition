"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  Fingerprint,
  Layers,
  Lock,
  Search,
  Server,
  ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";
import { guardianApi, type AuthUser } from "@/lib/api";

interface ShowcaseScenario {
  id: string;
  label: string;
  question: string;
  classification: string;
  bm25Score: string;
  vectorScore: string;
  rrfScore: string;
  sourceDoc: string;
  page: number;
  sha256Prefix: string;
  excerpt: string;
  answer: string;
}

const SCENARIOS: ShowcaseScenario[] = [
  {
    id: "secnumcloud",
    label: "SecNumCloud & PSSI",
    question: "Comment l'isolation inter-filiales est-elle garantie dans les index vectoriels ?",
    classification: "CONFIDENTIEL",
    bm25Score: "4.8210",
    vectorScore: "0.9412",
    rrfScore: "0.0328",
    sourceDoc: "pssi_secnumcloud_groupe_2026.pdf",
    page: 4,
    sha256Prefix: "8f3c91a2e4b07d6c119e45a28c7d31f0",
    excerpt:
      "Toutes les données documentaires, index vectoriels et journaux d'audit sont cloisonnés par tenantId et spaceId. Aucune donnée d'une filiale n'est mutualisée.",
    answer:
      "Le cloisonnement logique strict (tenantId / spaceId) s'applique en amont de chaque calcul BM25 et vectoriel. Toute requête inter-tenant lève une erreur d'isolation 403 journalisée dans la chaîne d'audit SHA-256.",
  },
  {
    id: "hybrid-rag",
    label: "Pipeline BM25 + RRF",
    question: "Comment la fusion hybride élimine-t-elle les approximations sur les codes réglementaires ?",
    classification: "RESTREINT",
    bm25Score: "6.1405",
    vectorScore: "0.9180",
    rrfScore: "0.0331",
    sourceDoc: "architecture_rag_hybride_v3.pdf",
    page: 7,
    sha256Prefix: "4b71e90c33d8a2f1907c5521ab94e21d",
    excerpt:
      "Le moteur lexical BM25 (k1=1.5, b=0.75) garantit la correspondance exacte des acronymes et références, fusionnée par RRF avec la projection vectorielle dense.",
    answer:
      "Les deux moteurs opèrent en parallèle sur les fragments autorisés : BM25 capte la précision lexicale exacte tandis que la similarité cosinus modélise le sens. La fusion Reciprocal Rank Fusion (RRF) classe les preuves avant génération.",
  },
  {
    id: "meal-guardian",
    label: "Contrôle Qualité MEAL",
    question: "Quelles anomalies terrain sont bloquées lors des collectes CommCare et Kobo ?",
    classification: "INTERNE",
    bm25Score: "5.3920",
    vectorScore: "0.9045",
    rrfScore: "0.0322",
    sourceDoc: "protocole_collecte_sahel_2026.pdf",
    page: 2,
    sha256Prefix: "c2198d44f08a7e3190ab6218cc3190f4",
    excerpt:
      "Tout écart GPS hors périmètre (> 25 km), doublon E.164 ou saisie copier-coller répétitive par un même enquêteur déclenche une file de validation humaine.",
    answer:
      "Le moteur autonome vérifie les coordonnées GPS, normalise les téléphones E.164, détecte les doublons flous et isole les anomalies dans une file de validation réversible avec export hebdomadaire .docx.",
  },
];

export default function ShowcaseLandingPage() {
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>(SCENARIOS[0].id);

  // Enterprise contact form state
  const [organization, setOrganization] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [employeeCount, setEmployeeCount] = useState("500 - 2 500 collaborateurs");
  const [deploymentMode, setDeploymentMode] = useState<"SecNumCloud" | "On-Premise" | "Hybride">(
    "SecNumCloud"
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ticketId: string; message: string } | null>(
    null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    guardianApi
      .me()
      .then((res) => {
        if (active && res?.user) setSessionUser(res.user);
      })
      .catch(() => {
        // Visiteur anonyme — comportement nominal sur la vitrine publique
      });
    return () => {
      active = false;
    };
  }, []);

  const activeScenario =
    SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const res = await guardianApi.submitEnterpriseContact({
        organization: organization.trim(),
        contactName: contactName.trim(),
        email: email.trim(),
        employeeCount,
        deploymentMode,
        message: message.trim(),
      });
      setSubmitResult({ ticketId: res.ticketId, message: res.message });
      setOrganization("");
      setContactName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Veuillez vérifier les champs saisis et réessayer."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Bar Contract: strictly 3 zones */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-6 py-4">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-foreground whitespace-nowrap shrink-0"
          >
            Misaina Cognition
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
            <a
              href="#architecture"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
            <a
              href="#pipeline"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Pipeline RAG
            </a>
            <a
              href="#conformite"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Conformité
            </a>
            <a
              href="#deploiement"
              className="hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              Déploiement
            </a>
          </nav>

          <div className="shrink-0">
            {sessionUser ? (
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                Accéder aux espaces
                <ArrowRight size={14} />
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                Se connecter
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="border-b border-border bg-card/40">
          <div className="mx-auto max-w-7xl px-6 py-14 lg:py-20">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-stretch">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="lg:col-span-6 flex flex-col justify-between space-y-8"
              >
                <div className="space-y-5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                    Infrastructure d&apos;Intelligence Documentaire &amp; Gouvernance
                  </p>
                  <h1
                    className="font-bold tracking-tight text-foreground leading-[1.12]"
                    style={{
                      fontSize: "clamp(2.25rem, 3.6vw, 3.4rem)",
                      textWrap: "balance",
                    }}
                  >
                    Le Moteur de Connaissance Souverain Dédié aux Grandes Organisations
                  </h1>
                  <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
                    Fédérez les silos documentaires de votre groupe dans un pipeline certifié BM25
                    et vecteurs denses. Bénéficiez d&apos;une traçabilité cryptographique des
                    citations et d&apos;une isolation multitenant conforme SecNumCloud et PSSI.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <Link
                    href={sessionUser ? "/workspace" : "/login"}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                  >
                    {sessionUser ? "Ouvrir mon espace de travail" : "Se connecter pour agir"}
                    <ArrowRight size={16} />
                  </Link>
                  <a
                    href="#deploiement"
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap shrink-0"
                  >
                    Demander un audit d&apos;architecture
                  </a>
                </div>
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock size={13} className="text-primary shrink-0" />
                  Accès strictement authentifié : aucune donnée MEAL ni rapport (.csv / .docx)
                  n&apos;est consultable ou téléchargeable publiquement.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.05 }}
                className="lg:col-span-6"
              >
                <div className="relative h-full min-h-[300px] lg:min-h-[380px] overflow-hidden rounded-2xl border border-border bg-slate-900">
                  <Image
                    src="/images/hero_sovereign_infrastructure.jpg"
                    alt="Centre d'opérations et d'infrastructure souveraine Misaina Cognition"
                    fill
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    referrerPolicy="no-referrer"
                    priority
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-100">
                    <div>
                      <p className="font-semibold text-sm text-white">
                        Déploiement Souverain Multi-Entités
                      </p>
                      <p className="text-slate-300">
                        Qualification SecNumCloud · Chiffrement JWT HS256 · Zéro fuite inter-tenant
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* 4-column enterprise quantitative strip */}
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 border-t border-border pt-8">
              <div className="rounded-xl border border-border bg-card p-5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Pipeline de recherche</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  BM25 + RRF
                </p>
                <p className="text-xs text-muted-foreground">
                  Fusion lexicale et vectorielle 128 dimensions
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Preuve de citation</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  SHA-256 / HMAC
                </p>
                <p className="text-xs text-muted-foreground">
                  Scellement cryptographique jusqu&apos;au fragment source
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Cloisonnement logique</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  100 % Isolé
                </p>
                <p className="text-xs text-muted-foreground">
                  Index, règles YAML et journaux dédiés par tenant
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Livrables exécutifs</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground">
                  Export .docx
                </p>
                <p className="text-xs text-muted-foreground">
                  Notes de synthèse et rapports MEAL auditables
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 01: Asymmetric Bento Capabilities */}
        <section id="architecture" className="mx-auto max-w-7xl px-6 py-16 lg:py-20 space-y-10">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Architecture Entreprise
            </p>
            <h2
              className="text-2xl md:text-3xl font-bold tracking-tight text-foreground"
              style={{ textWrap: "balance" }}
            >
              Conçu pour les exigences des DSI, RSSI et directions opérationnelles
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Misaina Cognition réunit l&apos;intelligence documentaire souveraine (RAG hybride
              certifié) et le contrôle qualité autonome des flux de données terrain.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Marquee Card 1 */}
            <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-7 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  01. Pipeline Hybride BM25 &amp; Vecteurs Denses
                </h3>
                <Search size={18} className="text-primary shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Les moteurs purement vectoriels échouent sur les références exactes, numéros
                d&apos;articles, acronymes internes et codes réglementaires. Notre pipeline exécute
                conjointement un score lexical BM25 calibré (k1=1.5, b=0.75) et une similarité
                cosinus sur vecteurs denses, unifiés par Reciprocal Rank Fusion (RRF).
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-5 text-xs">
                <div>
                  <span className="text-muted-foreground block">Exactitude lexicale</span>
                  <span className="font-mono font-semibold text-foreground">BM25 Pondéré</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Compréhension sémantique</span>
                  <span className="font-mono font-semibold text-foreground">Vecteurs Cosinus</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Arbitrage des rangs</span>
                  <span className="font-mono font-semibold text-foreground">Fusion RRF (k=60)</span>
                </div>
              </div>
            </div>

            {/* Marquee Visual Card 2 */}
            <div className="lg:col-span-5 rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
              <div className="relative h-48 w-full bg-slate-900 overflow-hidden">
                <Image
                  src="/images/vault_isolation_architecture.jpg"
                  alt="Architecture de coffres isolés multi-tenant"
                  fill
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  referrerPolicy="no-referrer"
                  className="object-cover"
                />
              </div>
              <div className="p-6 space-y-2 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground">
                      02. Isolation Multitenant SecNumCloud
                    </h3>
                    <Lock size={18} className="text-primary shrink-0" />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Chaque filiale ou direction opère dans un périmètre strictement cloisonné.
                    Toute tentative d&apos;accès croisé est bloquée côté serveur (HTTP 403) et
                    tracée.
                  </p>
                </div>
                <p className="text-xs font-mono text-muted-foreground pt-3 border-t border-border">
                  JwtClaims HS256 · Cookies HttpOnly · Zéro index partagé
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  03. Traçabilité Cryptographique des Citations
                </h3>
                <Fingerprint size={18} className="text-primary shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Chaque fragment indexé est scellé par empreinte SHA-256 et lié à un arbre de
                Merkle. Lors d&apos;une réponse, chaque citation génère un reçu HMAC-SHA256
                vérifiable mathématiquement en un clic par vos auditeurs ou votre RSSI.
              </p>
              <div className="rounded-lg border border-border bg-muted/50 p-3 font-mono text-[11px] text-muted-foreground space-y-1">
                <div>Algorithme : SHA-256 + HMAC-SHA256</div>
                <div>Racine Merkle : Vérification temps réel intégrée</div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-7 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">
                  04. Contrôle Qualité Autonome &amp; Agent MEAL Intégré
                </h3>
                <Database size={18} className="text-primary shrink-0" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                En complément du moteur de connaissance, vos équipes opérations disposent d&apos;un
                pipeline autonome pour ingérer les collectes CSV, Excel, CommCare, Kobo et ODK,
                détecter les écarts GPS/zone, dédupliquer sans suppression physique et exporter des
                rapports hebdomadaires certifiés au format Word (.docx).
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
                <span>Idempotence SHA-256</span>
                <span aria-hidden="true">·</span>
                <span>Détection copier-coller enquêteurs</span>
                <span aria-hidden="true">·</span>
                <span>Requêtes NLQ Français &amp; Malagasy</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 02: Interactive RAG Pipeline Demonstrator */}
        <section id="pipeline" className="border-y border-border bg-card/50 py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-6 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  Architecture Technique du Pipeline (Aperçu Statique)
                </p>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                  Inspectez le calcul RRF et la preuve cryptographique
                </h2>
                <p className="text-xs text-muted-foreground">
                  Exemples illustratifs sans aucune donnée terrain réelle : l&apos;accès aux jeux
                  de données MEAL, exports et actions requiert une connexion.
                </p>
              </div>

              {/* Segmented filter controls */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background p-1">
                {SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setActiveScenarioId(sc.id)}
                    className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeScenario.id === sc.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-6 space-y-5">
                <div className="space-y-1.5 border-b border-border pb-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Requête soumise au moteur</span>
                    <span className="font-mono">
                      Classification : {activeScenario.classification}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    {activeScenario.question}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Réponse générée sous contrainte documentaire
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {activeScenario.answer}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      Extrait vérifié : {activeScenario.sourceDoc}
                    </span>
                    <span className="font-mono text-muted-foreground">
                      Page {activeScenario.page}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {activeScenario.excerpt}
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="text-sm font-semibold text-foreground">
                      Télémétrie de Preuve &amp; Scoring
                    </span>
                    <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border bg-background p-3">
                      <span className="text-[11px] text-muted-foreground block">Score BM25</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                        {activeScenario.bm25Score}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <span className="text-[11px] text-muted-foreground block">Cosinus Vect.</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                        {activeScenario.vectorScore}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border bg-background p-3">
                      <span className="text-[11px] text-muted-foreground block">Score RRF</span>
                      <span className="text-lg font-bold font-mono tabular-nums text-primary">
                        {activeScenario.rrfScore}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border bg-background p-4 font-mono text-xs">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Empreinte SHA-256 fragment</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        SCELLÉ
                      </span>
                    </div>
                    <div className="break-all text-[11px] text-foreground">
                      {activeScenario.sha256Prefix}...
                    </div>
                  </div>
                </div>

                <Link
                  href={sessionUser ? "/workspace" : "/login"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-semibold text-background hover:opacity-90 transition-opacity"
                >
                  {sessionUser
                    ? "Accéder à mes espaces et rapports"
                    : "Se connecter pour consulter ou exporter"}
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Section 03: Governance & Compliance Proofs */}
        <section id="conformite" className="mx-auto max-w-7xl px-6 py-16 lg:py-20 space-y-10">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Conformité &amp; Auditabilité
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Conçu pour passer les homologations RSSI les plus strictes
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Chaque opération — ingestion, recherche RAG, vérification de preuve, décision de
                validation humaine ou rollback — inscrit un enregistrement chaîné cryptographiquement
                dans le registre du tenant.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Server size={16} className="text-primary" />
                  Conformité SecNumCloud
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Déploiement compatible cloud qualifié SecNumCloud ou infrastructure On-Premise
                  déconnectée avec repli déterministe sans dépendance LLM externe.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ShieldCheck size={16} className="text-primary" />
                  Gouvernance PSSI &amp; RBAC
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Niveaux de sensibilité (PUBLIC, INTERNE, RESTREINT, CONFIDENTIEL) appliqués
                  directement lors du filtrage des chunks avant génération.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileCheck2 size={16} className="text-primary" />
                  Chaîne d&apos;Audit Immuable
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Chaque événement référence le condensat SHA-256 de l&apos;événement précédent,
                  garantissant la détection immédiate de toute altération du journal.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Layers size={16} className="text-primary" />
                  Pseudonymisation Automatique
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Masquage réversible des données personnelles (PII) en mémoire locale avant toute
                  sollicitation d&apos;un modèle d&apos;inférence externe.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 04: Enterprise Lead Capture */}
        <section id="deploiement" className="border-t border-border bg-card/40 py-16 lg:py-20">
          <div className="mx-auto max-w-4xl px-6 space-y-8">
            <div className="text-center space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Déploiement Grands Comptes
              </p>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                Planifier une démonstration ou un audit PSSI
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Indiquez votre environnement cible (SecNumCloud, On-Premise ou Hybride) pour
                recevoir un dossier d&apos;architecture et un accès dédié.
              </p>
            </div>

            <form
              onSubmit={handleContactSubmit}
              className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-5 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Organisation / Groupe
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ex. Groupe Industriel Horizon"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Nom et fonction
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ex. Claire Moreau, RSSI"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Email professionnel
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="c.moreau@organisation.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Effectif</label>
                  <select
                    value={employeeCount}
                    onChange={(e) => setEmployeeCount(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="250 - 500 collaborateurs">250 - 500 collaborateurs</option>
                    <option value="500 - 2 500 collaborateurs">500 - 2 500 collaborateurs</option>
                    <option value="2 500 - 10 000 collaborateurs">
                      2 500 - 10 000 collaborateurs
                    </option>
                    <option value="Plus de 10 000 collaborateurs">
                      Plus de 10 000 collaborateurs
                    </option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Mode d&apos;hébergement
                  </label>
                  <select
                    value={deploymentMode}
                    onChange={(e) =>
                      setDeploymentMode(
                        e.target.value as "SecNumCloud" | "On-Premise" | "Hybride"
                      )
                    }
                    className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="SecNumCloud">Cloud qualifié SecNumCloud</option>
                    <option value="On-Premise">On-Premise / Air-Gapped</option>
                    <option value="Hybride">Hybride multi-filiales</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Périmètre documentaire et exigences de conformité
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={5}
                  placeholder="Précisez les volumes documentaires, connecteurs souhaités (SharePoint, CommCare, Kobo, S3) ou contraintes PSSI..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                />
              </div>

              {submitError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400">
                  {submitError}
                </div>
              )}

              {submitResult && (
                <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{submitResult.message}</p>
                    <p className="font-mono mt-0.5">
                      Référence dossier : {submitResult.ticketId}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <span className="text-xs text-muted-foreground">
                  Réponse sous 24h ouvrées par notre équipe architecture.
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {submitting ? "Enregistrement…" : "Envoyer la demande"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-start sm:items-center justify-between gap-6 px-6 text-xs text-muted-foreground">
          <div className="space-y-1">
            <p className="font-semibold text-foreground text-sm">Misaina Cognition</p>
            <p>
              Moteur de connaissance souverain · Pipeline RAG BM25 &amp; Vecteurs · Gouvernance MEAL
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <a href="#architecture" className="hover:text-foreground transition-colors">
              Architecture
            </a>
            <a href="#pipeline" className="hover:text-foreground transition-colors">
              Pipeline RAG
            </a>
            <a href="#conformite" className="hover:text-foreground transition-colors">
              SecNumCloud &amp; PSSI
            </a>
            <Link
              href={sessionUser ? "/workspace" : "/login"}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {sessionUser ? "Mon espace" : "Connexion"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
