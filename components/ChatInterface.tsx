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

export function ChatInterface() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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

  function startNewChat() {
    setConversation(null);
    setMessages([]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground transition-colors">
      {/* Messages Scroll Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-6">
        {messages.length === 0 ? (
          /* Claude AI Welcome Centerpiece */
          <div className="mx-auto max-w-2xl min-h-[calc(100vh-160px)] flex flex-col justify-center py-10 space-y-8">
            {/* Claude-style warm greeting */}
            <div className="text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <Sparkles size={24} className="stroke-[2.2]" />
              </div>
              <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
                Que souhaitez-vous explorer aujourd&apos;hui ?
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-lg mx-auto font-sans leading-relaxed">
                Interrogez la base documentaire certifiée de votre organisation. Réponses sourcées, auditées et conformes aux protocoles PSSI et CHS.
              </p>
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
                    Gemini 3.8 Flash
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

            {/* 4 Claude-style Suggestion Cards */}
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
                    className="group flex flex-col items-start rounded-xl border border-border/80 bg-card/60 hover:bg-card p-3.5 text-left transition-all duration-150 hover:border-primary/40 hover:shadow-xs select-none"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-serif text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </span>
                      <ArrowUp size={12} className="text-muted-foreground rotate-45 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                    </div>
                    <span className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
                      {item.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active Conversation Stream */
          <div className="mx-auto max-w-3xl py-6 space-y-7">
            {/* Session Top Bar */}
            <div className="flex items-center justify-between border-b border-border/60 pb-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-primary" />
                <span className="font-serif font-medium text-foreground">Session Documentaire Active</span>
                <span className="text-muted-foreground font-mono text-[11px]">· {messages.length} messages</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={generateDoc}
                  disabled={generatingDoc}
                  className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 hover:bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors disabled:opacity-50"
                  title="Exporter la synthèse au format Word (.docx)"
                >
                  <FileDown size={12} className="text-primary" />
                  <span>{generatingDoc ? "Synthèse..." : "Exporter document"}</span>
                </button>

                <button
                  onClick={startNewChat}
                  className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card/60 hover:bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors"
                  title="Réinitialiser la conversation"
                >
                  <RotateCcw size={12} />
                  <span>Effacer</span>
                </button>
              </div>
            </div>

            {/* Message List */}
            {messages.map((m, i) => (
              <div key={i} className="space-y-3">
                {m.role === "user" ? (
                  /* User prompt: subtle warm parchment container aligned right */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl bg-secondary/80 dark:bg-muted/80 text-foreground px-4 py-3 shadow-2xs font-sans text-sm md:text-[15px] leading-relaxed">
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ) : (
                  /* Claude / Assistant answer: direct on canvas with serif header & clean markdown */
                  <div className="space-y-2 pt-2">
                    {/* Header: Claude-style avatar & identity */}
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
                        <Sparkles size={12} className="stroke-[2.5]" />
                      </div>
                      <span className="font-serif font-semibold text-foreground text-sm">
                        Misaina Cognition
                      </span>
                      {m.modelUsed && (
                        <span className="text-[10px] font-mono text-muted-foreground border-l border-border pl-2">
                          {m.modelUsed}
                        </span>
                      )}
                    </div>

                    {/* Markdown Body */}
                    <div className="pl-8 text-foreground/95 text-sm md:text-[15px] leading-relaxed space-y-3 font-sans">
                      <div className="prose dark:prose-invert max-w-none prose-sm prose-p:leading-relaxed prose-headings:font-serif prose-headings:font-semibold">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>

                      {/* Cited Sources Accordion */}
                      {m.sources && m.sources.length > 0 && (
                        <div className="pt-1">
                          <SourceViewer sources={m.sources} />
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
                )}
              </div>
            ))}

            {/* Claude-style pulsating thinking indicator */}
            {loading && (
              <div className="flex items-center gap-3 pt-2 pl-2 text-xs text-muted-foreground font-sans">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles size={13} className="animate-spin stroke-[2]" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-serif text-sm font-medium text-foreground">Misaina réfléchit</span>
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:200ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:400ms]" />
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    (Filtrage ResourceGuard & citations)
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
                    Gemini 3.8 Flash
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
                <span className="text-muted-foreground block text-[11px]">Inférence Sémantique LLM</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.inferenceMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Inférence Gemini 3.8 Flash</p>
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
              <Button onClick={() => setInspectingPipeline(null)}>Fermer l&apos;inspection</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
