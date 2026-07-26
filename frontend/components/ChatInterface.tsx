"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useChatStore } from "@/lib/store";
import { Button } from "@/components/ui";
import ReactMarkdown from "react-markdown";
import { SourceViewer } from "./SourceViewer";
import type { ChatResponse } from "@/lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: ChatResponse["sources"];
  confidence?: number;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const conversationId = useChatStore((s) => s.conversationId);
  const setConversation = useChatStore((s) => s.setConversation);

  async function send() {
    if (!input.trim() || loading) return;
    const q = input;
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
        { role: "assistant", content: data.answer, sources: data.sources, confidence: data.confidence },
      ]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Erreur de communication avec le service IA." }]);
    } finally {
      setLoading(false);
    }
  }

  async function generateDoc() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const lastAi = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastUser || !lastAi) return;
    const { data } = await api.post("/chat/generate-document", {
      question: lastUser.content,
      answer: lastAi.content,
      sources: lastAi.sources ?? [],
    });
    window.open(`/api/chat/download/${data.id}`, "_blank");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-muted-foreground">Posez une question sur vos documents internes.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-3xl rounded-2xl px-4 py-3 ${
                m.role === "user" ? "bg-primary text-white" : "bg-muted"
              }`}
            >
              <ReactMarkdown>{m.content}</ReactMarkdown>
              {m.sources && m.sources.length > 0 && <SourceViewer sources={m.sources} />}
              {m.confidence !== undefined && (
                <span className="mt-2 block text-xs opacity-70">
                  Confiance: {(m.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-muted-foreground">Misaina réfléchit…</p>}
      </div>
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ex: Quelle est la procédure de recrutement ?"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <Button onClick={send} disabled={loading}>Envoyer</Button>
          <Button variant="outline" onClick={generateDoc}>Générer .docx</Button>
        </div>
      </div>
    </div>
  );
}
