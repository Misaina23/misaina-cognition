"use client";
import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import { useChatStore } from "@/lib/store";
import { Button } from "@/components/ui";
import ReactMarkdown from "react-markdown";
import { SourceViewer } from "./SourceViewer";
import type { ChatResponse } from "@/lib/types";
import {
  Send,
  FileDown,
  Sparkles,
  RotateCcw,
  Copy,
  Check,
  Plus,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
  confidence?: number;
}

const SUGGESTIONS = [
  "Règles et indemnités de télétravail",
  "Procédure d'onboarding nouvel employé",
  "Politique de sécurité des mots de passe",
  "Prise en charge mutuelle et jours de RTT",
];

export function ChatInterface() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = useChatStore((s) => s.conversationId);
  const setConversation = useChatStore((s) => s.setConversation);

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
      });

      setConversation(data.conversationId);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          confidence: data.confidence,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Une erreur est survenue lors de la communication avec le moteur de recherche documentaire.",
        },
      ]);
    } finally {
      setLoading(false);
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
      alert("Erreur lors de la génération de la fiche Word.");
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
      <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-card/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck size={16} className="text-emerald-500" />
          <span>Gouvernance RBAC active · Réponses sourcées</span>
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
                Assistant Documentaire Misaina
              </h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Posez vos questions en langage naturel. Le moteur extrait les passages pertinents et cite ses sources avec précision.
              </p>
            </div>

            {/* Suggestions */}
            <div className="pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Suggestions de questions
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

                  <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs text-muted-foreground">
                    {m.confidence !== undefined && (
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                        Indice de confiance : {(m.confidence * 100).toFixed(0)}%
                      </span>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
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
              <span>Recherche vectorielle et synthèse en cours…</span>
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
            placeholder="Posez votre question sur les procédures, la RH, la sécurité..."
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />

          <Button type="submit" disabled={!input.trim() || loading} className="shrink-0 px-4">
            <Send size={16} />
            <span className="hidden sm:inline">Envoyer</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
