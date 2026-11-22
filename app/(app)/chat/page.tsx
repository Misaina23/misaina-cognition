"use client";
import { ChatInterface } from "@/components/ChatInterface";
import { Sparkles, Bot } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card/40 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Assistant IA Cognition</h1>
            <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <Sparkles size={11} /> RAG Hybride
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Interrogez l&apos;ensemble de votre corpus d&apos;entreprise avec citations certifiées.
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatInterface />
      </div>
    </div>
  );
}
