"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DocumentUploader } from "@/components/DocumentUploader";
import { SearchBar } from "@/components/SearchBar";
import { Button, Modal } from "@/components/ui";
import {
  FileText,
  Trash2,
  Eye,
  Calendar,
  Building,
  HardDrive,
  Tag,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Layers,
} from "lucide-react";
import type { DocumentDto } from "@/lib/types";

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selectedDept, setSelectedDept] = useState("Tous");
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);

  const { data, isLoading } = useQuery<DocumentDto[]>({
    queryKey: ["docs"],
    queryFn: () => api.get("/documents").then((r) => r.data),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs"] });
      qc.invalidateQueries({ queryKey: ["mine"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const departments = ["Tous", "Ressources Humaines", "R&D", "Sécurité", "Général"];

  const filtered = (data ?? []).filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(q.toLowerCase()) ||
      d.fileName.toLowerCase().includes(q.toLowerCase()) ||
      d.department.toLowerCase().includes(q.toLowerCase());

    const matchesDept =
      selectedDept === "Tous" ||
      d.department.toLowerCase().includes(selectedDept.toLowerCase());

    return matchesSearch && matchesDept;
  });

  function getFileIcon(fileName: string) {
    if (fileName.endsWith(".pdf")) return <FileText className="text-red-500" size={20} />;
    if (fileName.endsWith(".docx") || fileName.endsWith(".doc"))
      return <FileText className="text-blue-500" size={20} />;
    if (fileName.endsWith(".xlsx"))
      return <FileSpreadsheet className="text-emerald-500" size={20} />;
    return <FileCode className="text-purple-500" size={20} />;
  }

  return (
    <div className="space-y-6 p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
          Base Documentaire d&apos;Entreprise
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Indexation multiformat, extraction sémantique et contrôle d&apos;accès RBAC pour le pipeline RAG.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload panel (4 columns) */}
        <div className="lg:col-span-4">
          <DocumentUploader />
        </div>

        {/* Document list & search (8 columns) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex-1">
              <SearchBar onSearch={setQ} placeholder="Rechercher par titre, nom de fichier ou département…" />
            </div>

            {/* Department filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    selectedDept === dept
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>
          </div>

          {/* Loading & Empty states */}
          {isLoading && (
            <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Chargement des documents indexés…</span>
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
              <FileText size={32} className="mx-auto text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">Aucun document ne correspond à votre recherche</p>
              <p className="text-xs text-muted-foreground">
                Essayez d&apos;ajuster vos critères ou importez un nouveau document via le volet latéral.
              </p>
            </div>
          )}

          {/* Document list cards */}
          <div className="space-y-3">
            {filtered.map((d) => (
              <div
                key={d.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted group-hover:scale-105 transition-transform">
                    {getFileIcon(d.fileName)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground truncate">{d.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono text-[11px] truncate">{d.fileName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{d.department}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">v{d.version}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{(d.size / 1024).toFixed(0)} Ko</span>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> Indexé pour RAG
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewingDoc(d)}
                    className="text-xs"
                  >
                    <Eye size={13} /> Consulter
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Supprimer définitivement "${d.title}" de la base ?`)) {
                        del.mutate(d.id);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Document Details Modal */}
      {viewingDoc && (
        <Modal
          isOpen={!!viewingDoc}
          onClose={() => setViewingDoc(null)}
          title={viewingDoc.title}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/60 p-2.5">
                <span className="text-muted-foreground block mb-0.5">Fichier source</span>
                <span className="font-mono font-medium text-foreground">{viewingDoc.fileName}</span>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <span className="text-muted-foreground block mb-0.5">Département</span>
                <span className="font-medium text-foreground">{viewingDoc.department}</span>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <span className="text-muted-foreground block mb-0.5">Taille</span>
                <span className="font-mono font-medium text-foreground">
                  {(viewingDoc.size / 1024).toFixed(1)} Ko
                </span>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <span className="text-muted-foreground block mb-0.5">Statut de vectorisation</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Conforme & Recherchable
                </span>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Aperçu de la synthèse sémantique
              </h4>
              <p className="text-xs leading-relaxed text-foreground bg-background rounded-lg border border-border p-3">
                {viewingDoc.summary ||
                  `Ce document est indexé au sein de la base de données vectorielle Misaina Cognition. Il sert de corpus de référence pour répondre aux interrogations des collaborateurs du pôle ${viewingDoc.department}.`}
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setViewingDoc(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
