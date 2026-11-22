"use client";
import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Menu, X, Layers } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { checked } = useRequireAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 animate-pulse">
            <Layers size={24} className="stroke-[2.2]" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Chargement de Misaina Cognition…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar />
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 w-72 h-full bg-card shadow-2xl">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile Header Bar */}
          <div className="flex md:hidden items-center justify-between border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <Layers size={16} />
              </div>
              <span className="font-bold text-sm">Misaina</span>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          {/* Desktop Top Header Bar with Mission Theater Selector & Health */}
          <TopHeader />

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </ErrorBoundary>
  );
}
