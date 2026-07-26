"use client";
import { ChatInterface } from "@/components/ChatInterface";

export default function ChatPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <h1 className="text-lg font-bold">Assistant IA — Misaina Cognition</h1>
        <p className="text-sm text-muted-foreground">Posez vos questions, l'IA cite ses sources.</p>
      </div>
      <div className="flex-1">
        <ChatInterface />
      </div>
    </div>
  );
}
