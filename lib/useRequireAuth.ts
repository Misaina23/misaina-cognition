"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./auth";

export function useRequireAuth() {
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!user || !token) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [user, token, router]);

  return { checked, user };
}
