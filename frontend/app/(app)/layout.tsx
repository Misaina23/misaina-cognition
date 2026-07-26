"use client";
import { Sidebar } from "@/components/Sidebar";
import { useRequireAuth } from "@/lib/useRequireAuth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { checked } = useRequireAuth();
  if (!checked) return <div className="flex h-screen items-center justify-center">Chargement…</div>;
  return (
    <div className="flex">
      <Sidebar />
      <main className="h-screen flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
