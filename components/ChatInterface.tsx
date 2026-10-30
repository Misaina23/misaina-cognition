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
  Send,
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
  Layers,
  Clock,
  Shield,
  Globe,
  Lock,
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
  "Standards d'eau potable et abris d'urgence du Projet Sphère",
  "Procédure d'évacuation d'urgence et sécurité terrain (SOP-SEC-09)",
  "Seuils d'appels d'offres et passation de marchés USAID / ECHO",
  "Politique SMSI ISO/IEC 27001, clés FIDO2 et chiffrement AES-256",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [inspectingPipeline, setInspectingPipeline] = useState<ChatResponse["ragPipeline"] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  async function handleSend(queryText?: string) {
    const q = (queryText || input).trim();
    if (!q || loading) return;

    setInput("");
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
          content: "Une erreur est survenue lors de la communication avec le moteur de recherche documentaire institutionnel.",
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
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border px-6 py-3 bg-card/60 backdrop-blur-sm gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <ShieldCheck size={16} className="text-emerald-500" />
            <span>ResourceGuard Actif</span>
          </div>
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] text-primary">
            Habilitation {user?.clearanceLevel || "C4"}
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1 font-medium text-muted-foreground">
            <Globe size={13} className="text-primary" />
            {selectedTheater === "TOUS" ? "Multi-Théâtre" : selectedTheater}
          </span>
          <span aria-hidden="true">·</span>
          <span>DLP & Isolation multitenant</span>
        </div>

        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateDoc}
              disabled={generatingDoc}
              className="text-xs"
            >
              <FileDown size={14} />
              {generatingDoc ? "Génération .docx…" : "Télécharger synthèse .docx"}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={startNewChat}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus size={14} /> Nouvelle session
          </Button>
        </div>
      </div>

      {/* Messages Scroll View */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-2xl py-12 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
              <Sparkles size={28} />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Assistant Décisionnel & RAG Misaina
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Posez vos questions opérationnelles et normatives. Le moteur extrait les passages certifiés selon votre habilitation ({user?.clearanceLevel || "C4"}) et applique un contrôle strict de traçabilité.
              </p>
            </div>

            {/* Suggestions */}
            <div className="pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Requêtes normatives suggérées
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(s)}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted/60 transition-all select-none"
                  >
                    <span>{s}</span>
                    <Send size={12} className="text-muted-foreground shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`relative max-w-3xl rounded-2xl p-4 md:p-5 shadow-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground font-medium rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}
            >
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              ) : (
                <div className="space-y-3">
                  <div className="prose dark:prose-invert prose-sm max-w-none text-sm leading-relaxed">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>

                  {m.sources && m.sources.length > 0 && <SourceViewer sources={m.sources} />}

                  {m.certified && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border-t border-border/50 pt-2">
                      <Award size={14} /> Réponse certifiée conforme par l&apos;officier de conformité
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      {m.confidence !== undefined && (
                        <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                          Confiance : {(m.confidence * 100).toFixed(0)}%
                        </span>
                      )}

                      {m.modelUsed && (
                        <span className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {m.modelUsed}
                        </span>
                      )}

                      {m.ragPipeline && (
                        <button
                          onClick={() => setInspectingPipeline(m.ragPipeline ?? null)}
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline font-mono"
                          title="Inspecter la latence et la décomposition RAG"
                        >
                          <Cpu size={12} /> {m.ragPipeline.latencyTotalMs}ms
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {/* Human-in-the-loop Certification & Feedback */}
                      {!m.certified && (
                        <button
                          onClick={() => handleCertify(i)}
                          className="flex items-center gap-1 hover:text-foreground text-[11px] p-1 transition-colors"
                          title="Certifier comme réponse officielle du référentiel"
                        >
                          <Award size={13} />
                          <span>Certifier</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleFeedback(i, "up")}
                        className={`p-1 transition-colors ${
                          m.rated === "up" ? "text-emerald-500" : "hover:text-foreground"
                        }`}
                        title="Réponse exacte et conforme"
                      >
                        <ThumbsUp size={13} />
                      </button>

                      <button
                        onClick={() => handleFeedback(i, "down")}
                        className={`p-1 transition-colors ${
                          m.rated === "down" ? "text-red-500" : "hover:text-foreground"
                        }`}
                        title="Signaler une inexactitude"
                      >
                        <ThumbsDown size={13} />
                      </button>

                      <button
                        onClick={() => handleCopy(m.content, i)}
                        className="flex items-center gap-1 hover:text-foreground p-1 transition-colors"
                        title="Copier la réponse"
                      >
                        {copiedIndex === i ? (
                          <>
                            <Check size={13} className="text-emerald-500" />
                            <span className="text-[11px]">Copié</span>
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
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-primary animate-bounce" />
              </div>
              <span>Filtrage ResourceGuard et inférence RAG en cours…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Box */}
      <div className="border-t border-border p-4 bg-card/80 backdrop-blur-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mx-auto max-w-4xl flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Posez votre question sur les standards Sphère, la sécurité terrain, ISO 27001, les bailleurs..."
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />

          <Button type="submit" disabled={!input.trim() || loading} className="shrink-0 px-4">
            <Send size={16} />
            <span className="hidden sm:inline">Envoyer</span>
          </Button>
        </form>
      </div>

      {/* Pipeline Explainability Modal */}
      {inspectingPipeline && (
        <Modal
          open={!!inspectingPipeline}
          onClose={() => setInspectingPipeline(null)}
          title="Décomposition du Pipeline d'Inférence RAG"
        >
          <div className="space-y-4 text-xs">
            <p className="text-muted-foreground">
              Mesure en temps réel des étapes de traitement pour garantir la traçabilité et l&apos;auditabilité de la réponse.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Recherche vectorielle & BM25</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.retrievalMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Projection et matching d&apos;index</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Reciprocal Rank Fusion</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.rrfMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Fusion & pondération des passages</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Inférence Sémantique LLM</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.inferenceMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Génération conditionnée aux citations</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
                <span className="text-muted-foreground block text-[11px]">Contrôle DLP & Intégrité</span>
                <span className="font-mono text-base font-bold text-foreground">
                  {inspectingPipeline.dlpMs} ms
                </span>
                <p className="text-[10px] text-muted-foreground">Filtrage PII et signature SHA-256</p>
              </div>
            </div>

            <div className="rounded-xl bg-card border border-border p-3 flex justify-between items-center font-mono">
              <span className="text-foreground font-semibold">Latence totale de bout en bout</span>
              <span className="text-primary font-bold text-sm">
                {inspectingPipeline.latencyTotalMs} ms
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setInspectingPipeline(null)}>Fermer</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
