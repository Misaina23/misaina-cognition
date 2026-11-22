"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { guardianApi } from "@/lib/api";

interface AuthGuardProps {
  spaceId?: string;
  children: React.ReactNode;
}

export function AuthGuard({ spaceId, children }: AuthGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    setAuthorized(false);

    guardianApi
      .me()
      .then((res) => {
        if (!active) return;
        if (!res?.user) {
          router.replace("/login");
          return;
        }
        if (spaceId) {
          const hasAccess = (res.spaces || []).some((s) => s.id === spaceId);
          if (!hasAccess) {
            const fallbackSpace = res.spaces?.[0]?.id;
            router.replace(
              fallbackSpace ? `/dashboard/${encodeURIComponent(fallbackSpace)}` : "/workspace"
            );
            return;
          }
        }
        setAuthorized(true);
      })
      .catch(() => {
        if (!active) return;
        router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [router, spaceId]);

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-xs text-muted-foreground shadow-sm">
          <Lock size={15} className="text-primary shrink-0" />
          <span>Authentification requise — vérification de la session en cours…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
