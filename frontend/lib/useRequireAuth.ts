"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth";

export function useRequireAuth() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { router.replace("/login"); return; }
      const ok = await fetchMe();
      if (active && !ok) router.replace("/login");
      if (active) setChecked(true);
    })();
    return () => { active = false; };
  }, [token, fetchMe, router]);

  return { token, checked };
}
