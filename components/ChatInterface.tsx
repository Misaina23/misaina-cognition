"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useChatStore, useMissionStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth";
import { Button, Modal } from "@/components/ui";
import ReactMarkdown from "react-markdown";
import { SourceViewer } from "./SourceViewer";
import type { ChatResponse } from "@/lib/types";
import {
  ArrowUp,
  FileDown,
  Sparkles,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  Cpu,
  ThumbsUp,
  ThumbsDown,
  Award,
  Clock,
  Shield,
  Globe,
  Lock,
  Paperclip,
  RotateCcw,
  BookOpen,
  SlidersHorizontal,
  FileText,
  Compass,
} from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
  confidence?: number;
  dlpStatus?: string;
  modelUsed?: string;
  ragPipeline?: ChatResponse["ragPipeline"];
  certified?: boolean;
  rated?: "up" | "down";
  suggestedFollowUps?: string[];
  reasoningMode?: "deep" | "operational" | "audit";
}

const SUGGESTIONS = [
  {
    title: "Standards d'urgence Sphère",
    subtitle: "Rations d'eau potable et abris humanitaires",
    query: "Quels sont les standards minimaux d'eau potable et d'abris d'urgence selon le Projet Sphère ?",
  },
  {
    title: "Sécurité terrain & Évacuation",
    subtitle: "Procédure d'urgence et protocole SOP-SEC-09",
    query: "Quelle est la procédure d'évacuation d'urgence et de repli sécuritaire selon le protocole SOP-SEC-09 ?",
  },
  {
    title: "Conformité ISO 27001 & PSSI",
    subtitle: "Chiffrement AES-256, MFA FIDO2 et règles d'accès",
    query: "Quelles sont les exigences de longueur de mot de passe, MFA FIDO2 et chiffrement de la PSSI 2026 ?",
  },
  {
    title: "Passation de marchés & Bailleurs",
    subtitle: "Seuils d'appels d'offres ECHO et USAID",
    query: "Quels sont les seuils financiers obligatoires pour les appels d'offres ouverts selon les règles ECHO et USAID ?",
  },
];

const REASONING_MODES = [
  {
    id: "deep" as const,
    label: "Analyse Stratégique",
    desc: "Rapprochements normatifs multi-sources, matrice d'impact et plan d'action détaillé",
    icon: Sparkles,
  },
  {
    id: "operational" as const,
    label: "Synthèse Opérationnelle",
    desc: "Checklist immédiate, règles prioritaires terrain et points de contact",
    icon: Compass,
  },
  {
    id: "audit" as const,
    label: "Audit & Conformité",
    desc: "Vérification stricte des seuils bailleurs, classifications PSSI et sanctions",
    icon: ShieldCheck,
  },
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasoningMode, setReasoningMode] = useState<"deep" | "operational" | "audit">("deep");
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [inspectingPipeline, setInspectingPipeline] = useState<ChatResponse["ragPipeline"] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversationId = useChatStore((s) => s.conversationId);
  const setConversation = useChatStore((s) => s.setConversation);
  const selectedTheater = useMissionStore((s) => s.selectedTheater);
  const user = useAuthStore((s) => s.user);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Adjust textarea height automatically
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  async function handleSend(queryText?: string) {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);

    try {
      const { data } = await api.post<ChatResponse>("/chat/question", {
        question: q,
        conversationId: conversationId ?? undefined,
        missionTheater: selectedTheater,
        reasoningMode,
      });

      setConversation(data.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          confidence: data.confidence,
          dlpStatus: data.dlpStatus,
          modelUsed: data.modelUsed,
          ragPipeline: data.ragPipeline,
          suggestedFollowUps: data.suggestedFollowUps,
          reasoningMode: data.reasoningMode,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Une indisponibilité temporaire est survenue lors de l'accès au moteur documentaire institutionnel. Veuillez vérifier votre connexion ou réitérer votre requête.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleFeedback(index: number, rating: "up" | "down") {
    const msg = messages[index];
    if (!msg || msg.rated) return;

    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, rated: rating } : m))
    );

    try {
      await api.post("/chat/feedback", {
        query: messages[index - 1]?.content || "Question",
        rating: rating === "up" ? "positive" : "negative",
      });
    } catch {
      // feedback logged silently
    }
  }

  async function handleCertify(index: number) {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, certified: true } : m))
    );

    try {
      await api.post("/chat/feedback", {
        query: messages[index - 1]?.content || "Question certifiée",
        rating: "positive",
        certified: true,
      });
    } catch {
      // logged silently
    }
  }

  async function generateDoc() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastAi = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastUser || !lastAi || generatingDoc) return;

    setGeneratingDoc(true);
    try {
      const { data } = await api.post("/chat/generate-document", {
        question: lastUser.content,
        answer: lastAi.content,
        sources: lastAi.sources ?? [],
      });
      window.open(`/api/chat/download/${data.id}`, "_blank");
    } catch {
      // handled
    } finally {
      setGeneratingDoc(false);
    }
  }

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {messages.length === 0 ? (
          <div className="mx-auto max-w-2xl min-h-[calc(100vh-160px)] flex flex-col justify-center py-8 space-y-7">
            {/* Claude-style warm greeting */}
            <div className="text-center space-y-2.5">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <Sparkles size={24} className="stroke-[2.2]" />
              </div>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                Que souhaitez-vous explorer aujourd&apos;hui ?
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto font-sans leading-relaxed">
                Moteur de cognition documentaire souverain. Réponses sourcées, auditées et conformes aux protocoles PSSI, Sphère et bailleurs.
              </p>
            </div>

            {/* Reasoning Mode Selector */}
            <div className="flex items-center justify-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/80 max-w-lg mx-auto w-full">
              {REASONING_MODES.map((mode) => {
                const Icon = mode.icon;
                const isActive = reasoningMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setReasoningMode(mode.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-card text-foreground shadow-xs border border-border/80 font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                    title={mode.desc}
                  >
                    <Icon size={13} className={isActive ? "text-primary" : "opacity-70"} />
                    <span className="truncate">{mode.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Central Claude-style Floating Prompt Card */}
            <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm hover:border-primary/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading}
                rows={2}
                placeholder="Posez une question sur les normes Sphère, la PSSI, les procédures terrain ou les contrats..."
                className="w-full resize-none bg-transparent px-2 py-1 text-sm md:text-base text-foreground placeholder:text-muted-foreground outline-none leading-relaxed"
              />

              {/* Bottom bar inside central prompt box */}
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5 rounded-md bg-secondary/60 px-2 py-0.5 text-[11px] font-mono text-secondary-foreground">
                    <ShieldCheck size={12} className="text-primary" />
                    ResourceGuard {user?.clearanceLevel || "C2"}
                  </span>
                  <span className="text-[11px] font-mono hidden sm:inline text-muted-foreground">
                    Théâtre : {selectedTheater === "TOUS" ? "Global" : selectedTheater}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline">
                    Moteur Cognitif Hybride
                  </span>
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-25 disabled:pointer-events-none shadow-xs"
                    title="Envoyer la question"
                  >
                    <ArrowUp size={16} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Suggestion Cards */}
            <div className="space-y-2">
              <div className="text-center">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80">
                  Requêtes documentaires fréquentes
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.query)}
                    className="flex flex-col text-left rounded-xl border border-border/80 bg-card/60 hover:bg-card p-3 transition-all hover:border-primary/40 hover:shadow-xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </span>
                      <Sparkles size={12} className="text-muted-foreground opacity-50 group-hover:opacity-100 group-hover:text-primary transition-opacity" />
                    </div>
                    <span className="text-[11px] text-muted-foreground mt-0.5 font-sans leading-tight">
                      {item.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 pb-28">
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                {m.role === "user" ? (
                  /* User message bubble */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl bg-secondary/80 text-foreground px-4 py-2.5 shadow-2xs text-sm md:text-[15px] leading-relaxed font-sans border border-border/60">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  /* Assistant message */
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary mt-0.5 shadow-2xs">
                      <Sparkles size={15} className="stroke-[2.2]" />
                    </div>

                    <div className="flex-1 space-y-3 min-w-0">
                      {/* Meta header of response */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                        <span className="font-serif font-semibold text-foreground text-xs">
                          Misaina Cognition
                        </span>
                        <span>·</span>
                        <span>
                          {m.reasoningMode === "audit"
                            ? "Audit & Risques"
                            : m.reasoningMode === "operational"
                            ? "Opérationnel"
                            : "Raisonnement Approfondi"}
                        </span>
                        {m.dlpStatus === "CONFORME" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded">
                            <ShieldCheck size={10} /> DLP Conforme
                          </span>
                        ) : m.dlpStatus === "PII_MASQUE" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                            <Lock size={10} /> PII Masqué
                          </span>
                        ) : null}
                      </div>

                      {/* Markdown Body */}
                      <div className="text-foreground/95 text-sm md:text-[15px] leading-relaxed space-y-3 font-sans">
                        <div className="prose dark:prose-invert max-w-none prose-sm prose-p:leading-relaxed prose-headings:font-serif prose-headings:font-semibold">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>

                        {/* Cited Sources Accordion */}
                        {m.sources && m.sources.length > 0 && (
                          <div className="pt-1">
                            <SourceViewer sources={m.sources} />
                          </div>
                        )}

                        {/* Suggested Follow-Ups */}
                        {m.suggestedFollowUps && m.suggestedFollowUps.length > 0 && (
                          <div className="pt-2 pb-1 space-y-1.5">
                            <span className="text-[11px] font-mono font-medium text-muted-foreground uppercase tracking-wider block">
                              Approfondissements recommandés :
                            </span>
                            <div className="flex flex-col sm:flex-row flex-wrap gap-1.5">
                              {m.suggestedFollowUps.map((su, sIdx) => (
                                <button
                                  key={sIdx}
                                  onClick={() => handleSend(su)}
                                  disabled={loading}
                                  className="text-left text-xs bg-muted/40 hover:bg-muted border border-border/80 hover:border-primary/40 text-foreground px-3 py-1.5 rounded-xl transition-all flex items-center gap-2 active:scale-[0.98] shadow-2xs group"
                                >
                                  <Sparkles size={11} className="text-primary shrink-0 opacity-70 group-hover:opacity-100" />
                                  <span className="line-clamp-2">{su}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Certification Stamp */}
                        {m.certified && (
                          <div className="flex items-center gap-2 text-xs font-serif font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 mt-3">
                            <Award size={15} />
                            <span>Réponse certifiée conforme et signée par l&apos;officier de conformité PSSI</span>
                          </div>
                        )}

                        {/* Footer Actions: Copy, Feedback, Certify, RAG Latency */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-3">
                            {m.confidence !== undefined && (
                              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                                Confiance : {(m.confidence * 100).toFixed(0)}%
                              </span>
                            )}

                            {m.ragPipeline && (
                              <button
                                onClick={() => setInspectingPipeline(m.ragPipeline ?? null)}
                                className="flex items-center gap-1 text-[11px] text-primary hover:underline font-mono"
                                title="Inspecter le pipeline RAG (BM25 + Dense + RRF)"
                              >
                                <Cpu size={12} /> {m.ragPipeline.latencyTotalMs}ms
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ml-auto">
                            {!m.certified && (
                              <button
                                onClick={() => handleCertify(i)}
                                className="flex items-center gap-1 hover:text-foreground text-[11px] px-2 py-1 rounded-md hover:bg-muted/70 transition-colors"
                                title="Certifier comme réponse officielle du référentiel"
                              >
                                <Award size={13} />
                                <span>Certifier</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleFeedback(i, "up")}
                              className={`p-1.5 rounded-md hover:bg-muted/70 transition-colors ${
                                m.rated === "up" ? "text-emerald-500" : "hover:text-foreground"
                              }`}
                              title="Réponse exacte et pertinente"
                            >
                              <ThumbsUp size={13} />
                            </button>

                            <button
                              onClick={() => handleFeedback(i, "down")}
                              className={`p-1.5 rounded-md hover:bg-muted/70 transition-colors ${
                                m.rated === "down" ? "text-red-500" : "hover:text-foreground"
                              }`}
                              title="Signaler une réserve ou inexactitude"
                            >
                              <ThumbsDown size={13} />
                            </button>

                            <button
                              onClick={() => handleCopy(m.content, i)}
                              className="flex items-center gap-1 hover:text-foreground p-1.5 rounded-md hover:bg-muted/70 transition-colors"
                              title="Copier la réponse"
                            >
                              {copiedIndex === i ? (
                                <>
                                  <Check size={13} className="text-emerald-500" />
                                  <span className="text-[11px] text-emerald-500">Copié</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} />
                                  <span className="text-[11px]">Copier</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Pulsating thinking indicator */}
            {loading && (
              <div className="flex items-center gap-3 pt-2 pl-2 text-xs text-muted-foreground font-sans">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles size={13} className="animate-spin stroke-[2]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-serif text-sm font-medium text-foreground">
                    Misaina analyse et croise les référentiels
                  </span>
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    (RRF, ResourceGuard & citations)
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Input Bar (when conversation has started) */}
      {messages.length > 0 && (
        <div className="border-t border-border/70 bg-background/95 backdrop-blur-md px-4 py-3">
          <div className="mx-auto max-w-3xl space-y-2">
            {/* Mode selector in conversation view */}
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-[11px] font-mono text-muted-foreground">Mode :</span>
                {REASONING_MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setReasoningMode(m.id)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      reasoningMode === m.id
                        ? "bg-primary/15 text-primary font-semibold"
                        : "hover:text-foreground text-muted-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <button
                  onClick={generateDoc}
                  disabled={generatingDoc}
                  className="flex items-center gap-1 text-primary hover:underline"
                  title="Exporter la dernière réponse en document officiel"
                >
                  <FileDown size={12} /> {generatingDoc ? "Génération…" : "Fiche .docx"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-card p-2.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={loading}
                rows={1}
                placeholder="Posez une question complémentaire ou demandez un approfondissement..."
                className="w-full resize-none bg-transparent px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Habilitation : {user?.clearanceLevel || "C2"}
                  </span>
                  <span className="text-[11px] font-mono border-l border-border/70 pl-2">
                    {selectedTheater === "TOUS" ? "Tous théâtres" : selectedTheater}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                    Moteur Cognitif Hybride
                  </span>
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || loading}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all duration-150 hover:opacity-90 active:scale-95 disabled:opacity-25 disabled:pointer-events-none shadow-xs"
                    title="Envoyer la question"
                  >
                    <ArrowUp size={15} className="stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-center text-[10px] text-muted-foreground font-mono">
              Misaina Cognition valide les passages cités et garantit la non-divulgation des données confidentielles.
            </p>
          </div>
        </div>
      )}

      {/* RAG Pipeline Explainability Modal */}
      {inspectingPipeline && (
        <Modal
          open={!!inspectingPipeline}
          onClose={() => setInspectingPipeline(null)}
          title="Audit du Pipeline d'Inférence RAG"
        >
          <div className="space-y-4 text-xs font-sans">
            <p className="text-muted-foreground leading-relaxed">
              Détail en temps réel des étapes de recherche hybride, de fusion Reciprocal Rank Fusion et du filtrage ResourceGuard.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Recherche vectorielle & BM25</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.retrievalMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Projection et matching d&apos;index</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Reciprocal Rank Fusion</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.rrfMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Fusion & pondération des passages</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Inférence Cognitive</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.inferenceMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Inférence Cognitive Misaina (RRF + Neural)</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Contrôle DLP & Intégrité</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.dlpMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Filtrage PII et signature SHA-256</p>
              </div>
            </div>

            <div className="rounded-xl bg-card border border-border/80 p-3 flex justify-between items-center font-mono">
              <span className="text-foreground font-semibold">Latence totale de bout en bout</span>
              <span className="text-primary font-bold text-sm">
                {inspectingPipeline.latencyTotalMs} ms
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={() => setInspectingPipeline(null)}>
                Fermer l&apos;audit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
