"use client";
import { useState } from "react";
import Link from "next/link";
import { DashboardCard } from "@/components/DashboardCard";
import { Button, Modal } from "@/components/ui";
import {
  GraduationCap,
  Award,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Compass,
  ShieldCheck,
  RotateCcw,
  FileText,
  Copy,
  Check,
  Clock,
  Send,
} from "lucide-react";

interface TrainingModule {
  id: string;
  title: string;
  tag: string;
  duration: string;
  description: string;
  questionsCount: number;
  badge: string;
}

const MODULES: TrainingModule[] = [
  {
    id: "mod-sec",
    title: "Sécurité Terrain & Procédures d'Évacuation",
    tag: "SOP-SEC-09",
    duration: "10 min",
    description: "Assimilation des 4 niveaux d'alerte opérationnelle (Vert à Rouge), des règles de convoi 4x4 et de l'autonomie en Safe Room.",
    questionsCount: 4,
    badge: "Sécurité Certifiée",
  },
  {
    id: "mod-sphere",
    title: "Standards Minimaux Humanitaires Sphère 2024",
    tag: "WASH & Abris",
    duration: "8 min",
    description: "Maîtrise des ratios universels : 15 litres d'eau/jour/personne, 3,5m² d'abri individuel et gestion du chlore résiduel.",
    questionsCount: 3,
    badge: "Expertise Sphère",
  },
  {
    id: "mod-usaid",
    title: "Passation de Marchés & Conformité Bailleurs",
    tag: "USAID & ECHO",
    duration: "12 min",
    description: "Contrôle des seuils financiers d'achats (3k$, 10k$, 50k$), avis de non-objection No Objection Letter et prévention de la fraude.",
    questionsCount: 4,
    badge: "Conformité Bailleurs",
  },
  {
    id: "mod-pssi",
    title: "Gouvernance Zero Trust & PSSI C1-C4",
    tag: "ISO 27001",
    duration: "7 min",
    description: "MFA FIDO2 obligatoire, chiffrement AES-256-GCM, règles de notification CNIL/ANSSI sous 72h et intégrité SHA-256.",
    questionsCount: 3,
    badge: "PSSI Niveau C4",
  },
];

interface QuizItem {
  id: number;
  question: string;
  context: string;
  options: { text: string; correct: boolean; explanation: string }[];
  citation: string;
}

const SAMPLE_QUIZ: QuizItem[] = [
  {
    id: 1,
    question: "En phase d'alerte Niveau Jaune, quelles sont les restrictions imposées aux déplacements terrain selon la SOP-SEC-09 ?",
    context: "Hub Opérationnel d'Urgence - Goma",
    options: [
      {
        text: "Déplacements libres toute la nuit avec simple pointage radio au retour",
        correct: false,
        explanation: "Faux : les déplacements de nuit sont strictement interdits en alerte Jaune.",
      },
      {
        text: "Couvre-feu opérationnel à 19h00, port permanent des gilets d'identification et gel des missions non essentielles hors agglomération",
        correct: true,
        explanation: "Conforme à la SOP-SEC-09 (Page 4) : le niveau Jaune impose le couvre-feu à 19h et l'identification visuelle.",
      },
      {
        text: "Évacuation immédiate de tout le personnel vers les Safe Rooms",
        correct: false,
        explanation: "Faux : le confinement en Safe Room n'intervient qu'en Niveau Orange ou Rouge.",
      },
    ],
    citation: "SOP-SEC-09 Sécurité Terrain, Page 4 - Classification C4",
  },
  {
    id: 2,
    question: "Quelle est la quantité minimale quotidienne vitale d'eau potable requise par personne selon le Projet Sphère 2024 ?",
    context: "Standards Universels WASH",
    options: [
      {
        text: "5 litres par personne et par jour",
        correct: false,
        explanation: "Insuffisant : 5L ne couvre que la survie hydrique d'extrême urgence mais viole les standards de base.",
      },
      {
        text: "15 litres par personne et par jour (boisson, cuisson, hygiène de base)",
        correct: true,
        explanation: "Exact : le Standard WASH 1 Sphère prescrit au minimum 15 litres d'eau potable/pers/jour avec point d'eau à moins de 500m.",
      },
      {
        text: "35 litres par personne et par jour",
        correct: false,
        explanation: "35 litres correspond au seuil supérieur de stabilisation pérenne mais non au standard d'urgence initial.",
      },
    ],
    citation: "Charte Humanitaire du Projet Sphère 2024, Page 82 - Classification C1",
  },
  {
    id: 3,
    question: "Quel est le seuil financier à partir duquel un achat financé par USAID ou DG ECHO exige un appel d'offres international ouvert ?",
    context: "Directives Bailleurs & Marchés",
    options: [
      {
        text: "Au-delà de 10 000 USD",
        correct: false,
        explanation: "Entre 10 000 et 50 000 USD, une procédure négociée restreinte est suffisante.",
      },
      {
        text: "Au-delà de 50 000 USD avec avis de non-objection formel du bailleur",
        correct: true,
        explanation: "Conforme : au-dessus de 50 000 USD, l'appel d'offres public international et la No Objection Letter sont obligatoires.",
      },
      {
        text: "Au-delà de 150 000 USD uniquement",
        correct: false,
        explanation: "Faux : le seuil d'adjudication publique est strictement fixé à 50 000 USD.",
      },
    ],
    citation: "Directives Bailleurs Internationaux, Page 22 - Classification C2",
  },
];

const PRE_DEPLOYMENT_BRIEFS: Record<string, { title: string; rules: string[]; contacts: string[] }> = {
  goma: {
    title: "Briefing Opérationnel d'Urgence · Hub Nord-Kivu (Goma)",
    rules: [
      "Convoi obligatoire de minimum 2 véhicules 4x4 tout-terrain avec treuils et balise Garmin InReach (pointage 15 min).",
      "Couvre-feu absolu à 19h00 (ou 18h00 en alerte Jaune renforcée) ; aucun déplacement individuel hors base.",
      "Radios VHF programmées sur le canal Sécurité Inter-Agences 04 ; veille permanente du FSO 24h/24.",
      "Safe Room certifiée avec 72h d'autonomie complète (eau, rations MRE, Iridium Extreme, trousse TCCC).",
      "Tolérance zéro PSEA : tout manquement entraîne révocation statutaire immédiate et saisine judiciaire.",
    ],
    contacts: ["Radio VHF : Canal 04 (Misaina Security)", "Téléphone Iridium FSO : +8816 314 209 11", "UNHAS Dispatch Goma : +243 81 000 4422"],
  },
  sahel: {
    title: "Briefing Opérationnel Régional · Bureau Sahel (Dakar & Postes Avancés)",
    rules: [
      "Validation de l'ordre de mission 24h avant tout déplacement interurbain par le coordinateur logistique.",
      "Vérification des 3 devis comparatifs pour tout achat entre 3 001 et 10 000 USD selon les règles bailleurs.",
      "Respect strict de la chaîne de distribution de chlore liquide à 0,5 mg/l pour les forages communautaires.",
      "Sécurisation des dossiers bénéficiaires : interdiction de photographier les pièces d'identité sur téléphones personnels (RGPD EDPB).",
    ],
    contacts: ["Coordination Sécurité Dakar : +221 33 800 1234", "Point Focal Bailleurs USAID : uaid-sahel@misaina.internal"],
  },
  kyiv: {
    title: "Briefing Opérationnel Réponse Rapide · Mission Est (Kyiv & Lviv)",
    rules: [
      "Application stricte des alertes aériennes d'État : descente immédiate aux abris fortifiés lors de toute sirène.",
      "Chiffrement intégral des ordinateurs portables en AES-256-GCM avec clé matérielle FIDO2 obligatoire.",
      "Enregistrement des bénéficiaires déplacés : AIPD obligatoire avant toute collecte de données biométriques.",
      "Sauvegarde des bases de données de mission répliquée quotidiennement vers le datacenter européen souverain.",
    ],
    contacts: ["Cellule d'Urgence Kyiv : +380 44 200 5500", "SOC Cybersécurité PSSI : soc@misaina.internal"],
  },
};

export default function LearningAcademyPage() {
  const [selectedTheaterKey, setSelectedTheaterKey] = useState<"goma" | "sahel" | "kyiv">("goma");
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [activeQuizStep, setActiveQuizStep] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState<number | null>(null);

  const activeBrief = PRE_DEPLOYMENT_BRIEFS[selectedTheaterKey];

  function handleSelectOption(qId: number, oIdx: number) {
    if (selectedAnswers[qId] !== undefined) return;
    setSelectedAnswers((prev) => ({ ...prev, [qId]: oIdx }));
  }

  function handleCalculateScore() {
    let correctCount = 0;
    SAMPLE_QUIZ.forEach((q) => {
      const selectedIdx = selectedAnswers[q.id];
      if (selectedIdx !== undefined && q.options[selectedIdx]?.correct) {
        correctCount++;
      }
    });
    setScore(correctCount);
  }

  function handleResetQuiz() {
    setSelectedAnswers({});
    setScore(null);
    setActiveQuizStep(0);
  }

  function copyBriefText() {
    const text = `${activeBrief.title}\n\nDIRECTIVES OPÉRATIONNELLES :\n${activeBrief.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\nCONTACTS D'URGENCE :\n${activeBrief.contacts.join("\n")}`;
    navigator.clipboard.writeText(text);
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2000);
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-serif">
              Académie de Connaissance & Onboarding
            </h1>
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-mono font-medium text-emerald-600 dark:text-emerald-400">
              <Award size={12} /> Certification Continue
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1 font-sans">
            Transmission de connaissances, réduction du temps d&apos;onboarding des expatriés et simulation de conformité sur le corpus institutionnel.
          </p>
        </div>

        <Link href="/chat">
          <Button size="sm" className="text-xs shadow-xs">
            <Sparkles size={14} /> Poser une question à l&apos;instructeur IA
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard
          title="Temps d'onboarding moyen"
          value="4 jours"
          trend="vs 3 semaines avant"
          hint="Accélération 75%"
          icon={Clock}
        />
        <DashboardCard
          title="Modules de certification"
          value={MODULES.length}
          trend="Couverture 100%"
          hint="Normes maîtresses"
          icon={BookOpen}
        />
        <DashboardCard
          title="Taux de réussite aux tests"
          value="94.2%"
          trend="Audit de conformité"
          hint="Collaborateurs validés"
          icon={Award}
        />
        <DashboardCard
          title="Fiches d'intervention"
          value="5 théâtres"
          trend="Mises à jour quotidiennes"
          hint="Prêtes à l'emploi"
          icon={Compass}
        />
      </div>

      {/* 4 Training Tracks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-foreground">
              Parcours d&apos;Instruction & Modules Essentiels
            </h2>
            <p className="text-xs text-muted-foreground font-sans">
              Formations obligatoires pré-déploiement validant la maîtrise des protocoles critiques.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-border bg-card p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-primary/40 transition-all"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {m.tag}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {m.duration}
                  </span>
                </div>

                <h3 className="font-serif font-bold text-sm text-foreground leading-snug">
                  {m.title}
                </h3>

                <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                  {m.description}
                </p>
              </div>

              <div className="border-t border-border/60 pt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground text-[11px] font-mono">
                  {m.questionsCount} cas pratiques
                </span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[11px]">
                  {m.badge}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Section: Interactive Quiz / Dilemma Simulation + Pre-Deployment Cheat-Sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Dilemma Quiz (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-bold text-base text-foreground">
                  Simulateur de Décision Opérationnelle en Mission
                </h3>
                <span className="font-mono text-[11px] text-primary bg-primary/10 px-2 py-0.5 rounded">
                  Évaluation Active
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-sans">
                Testez vos réflexes face aux exigences de conformité terrain et aux règles bailleurs.
              </p>
            </div>

            {score !== null && (
              <Button variant="outline" size="sm" onClick={handleResetQuiz} className="text-xs">
                <RotateCcw size={12} /> Recommencer
              </Button>
            )}
          </div>

          {score !== null ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Award size={26} />
              </div>
              <h4 className="font-serif text-lg font-bold text-foreground">
                Score de Conformité : {score} / {SAMPLE_QUIZ.length}
              </h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto font-sans leading-relaxed">
                {score === SAMPLE_QUIZ.length
                  ? "Félicitations ! Vous maîtrisez parfaitement les procédures opérationnelles critiques SOP-SEC-09, Sphère et USAID."
                  : "Bonne assimilation globale. Pensez à réviser les passages cités pour garantir la conformité intégrale lors de votre prochaine mission."}
              </p>
              <div className="pt-2">
                <Link href="/chat">
                  <Button size="sm" className="text-xs">
                    <Sparkles size={13} /> Approfondir les points d&apos;hésitation avec l&apos;IA
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {SAMPLE_QUIZ.map((item, qIdx) => {
                const userChoice = selectedAnswers[item.id];
                const hasAnswered = userChoice !== undefined;

                return (
                  <div key={item.id} className="rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-semibold text-primary">
                        Situation {qIdx + 1} / {SAMPLE_QUIZ.length}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {item.context}
                      </span>
                    </div>

                    <p className="font-serif font-bold text-sm text-foreground leading-snug">
                      {item.question}
                    </p>

                    <div className="space-y-2 pt-1">
                      {item.options.map((opt, oIdx) => {
                        const isChosen = userChoice === oIdx;
                        let optStyle = "border-border bg-card hover:border-primary/40 text-foreground";
                        if (hasAnswered) {
                          if (opt.correct) {
                            optStyle = "border-emerald-500/60 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
                          } else if (isChosen && !opt.correct) {
                            optStyle = "border-red-500/60 bg-red-500/10 text-red-800 dark:text-red-200";
                          } else {
                            optStyle = "opacity-50 border-border bg-card text-muted-foreground";
                          }
                        }

                        return (
                          <div
                            key={oIdx}
                            onClick={() => handleSelectOption(item.id, oIdx)}
                            className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${optStyle}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="font-mono text-[10px] font-bold mt-0.5 opacity-60">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              <div className="space-y-1">
                                <p className="font-medium leading-relaxed">{opt.text}</p>
                                {hasAnswered && isChosen && (
                                  <p className="text-[11px] font-mono mt-1 opacity-90">
                                    {opt.explanation}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {hasAnswered && (
                      <div className="text-[11px] font-mono text-muted-foreground pt-1 flex items-center gap-1.5">
                        <FileText size={11} className="text-primary" />
                        <span>Source réglementaire : {item.citation}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {Object.keys(selectedAnswers).length === SAMPLE_QUIZ.length && (
                <div className="pt-2 flex justify-end">
                  <Button onClick={handleCalculateScore} className="text-xs">
                    <CheckCircle2 size={14} /> Valider mes réponses & voir mon bilan
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pre-Deployment Mission Briefing / Cheat-Sheet (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-primary">
                  Partage de Connaissance Terrain
                </span>
                <h3 className="font-serif font-bold text-base text-foreground">
                  Fiche Réflexe Pré-Déploiement
                </h3>
              </div>

              <button
                onClick={copyBriefText}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted transition-colors"
                title="Copier la fiche pour la mission"
              >
                {copiedBrief ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span className="text-[10px] text-emerald-500">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span className="text-[10px]">Copier</span>
                  </>
                )}
              </button>
            </div>

            {/* Theater Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium text-[11px]">Théâtre :</span>
              {[
                { key: "goma", label: "Goma (Nord-Kivu)" },
                { key: "sahel", label: "Sahel (Dakar)" },
                { key: "kyiv", label: "Kyiv (Mission Est)" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTheaterKey(t.key as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    selectedTheaterKey === t.key
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "border border-border/80 bg-muted/30 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Brief Box */}
            <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3 text-xs">
              <h4 className="font-serif font-bold text-sm text-foreground">
                {activeBrief.title}
              </h4>

              <div className="space-y-2">
                <span className="font-mono text-[10px] font-bold uppercase text-muted-foreground block">
                  Directives Non-Négociables :
                </span>
                <ul className="space-y-2 font-sans text-foreground/90">
                  {activeBrief.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-mono text-[10px] font-bold mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-border/60 pt-3 space-y-1.5 font-mono text-[11px]">
                <span className="font-bold text-muted-foreground uppercase text-[10px] block">
                  Canaux d&apos;Urgence & Radio :
                </span>
                {activeBrief.contacts.map((c, i) => (
                  <p key={i} className="text-foreground">
                    {c}
                  </p>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Link href="/documents">
                <Button variant="outline" className="w-full text-xs">
                  <BookOpen size={13} /> Consulter l&apos;intégralité des référentiels de ce théâtre
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
