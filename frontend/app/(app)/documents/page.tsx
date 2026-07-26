"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DocumentUploader } from "@/components/DocumentUploader";
import { SearchBar } from "@/components/SearchBar";
import { Card, Button, Badge } from "@/components/ui";
import type { DocumentDto } from "@/lib/types";

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const { data } = useQuery<DocumentDto[]>({
    queryKey: ["docs"],
    queryFn: () => api.get("/documents").then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs"] }),
  });

  const filtered = (data ?? []).filter((d) => d.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Documents</h1>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1"><DocumentUploader /></div>
        <div className="md:col-span-2 space-y-3">
          <SearchBar onSearch={setQ} placeholder="Rechercher un document…" />
          {filtered.map((d) => (
            <Card key={d.id} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {d.fileName} · {d.department} · v{d.version}
                </p>
                <Badge className="mt-1">{d.status}</Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={() => del.mutate(d.id)}>Supprimer</Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
