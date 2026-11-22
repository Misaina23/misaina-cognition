"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useSession } from "@/components/SessionProvider";

interface AuthGuardProps {
  spaceId?: string;
  children: React.ReactNode;
}

export function AuthGuard({ spaceId, children }: AuthGuardProps) {
  const router = useRouter();
  const { user, spaces, loading } = useSession();

  const hasSpaceAccess = !spaceId || spaces.some((s) => s.id === spaceId);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (spaceId && !hasSpaceAccess) {
      const fallbackSpace = spaces[0]?.id;
      router.replace(
        fallbackSpace ? `/dashboard/${encodeURIComponent(fallbackSpace)}` : "/workspace"
      );
    }
  }, [hasSpaceAccess, loading, router, spaceId, spaces, user]);

  if (loading || !user || (spaceId && !hasSpaceAccess)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-xs text-muted-foreground shadow-sm">
          <Lock size={15} className="text-primary shrink-0" />
          <span>Vérification de la session signée et des accréditations en cours…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
