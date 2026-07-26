"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui";

export default function UsersPage() {
  const { data } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("/users").then((r) => r.data),
  });
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {(data ?? []).map((u: any) => (
          <Card key={u.id}>
            <p className="font-medium">{u.fullName}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
            <p className="mt-1 text-xs">{u.role} · {u.department}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
