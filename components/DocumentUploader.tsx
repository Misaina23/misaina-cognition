"use client";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSignalR } from "@/lib/websocket";
import { Button, Input } from "@/components/ui";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";

const CATEGORIES = ["Ressources Humaines", "R&D / Technique", "Sécurité & PSSI", "Organisation", "Général"];

export function DocumentUploader() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("Ressources Humaines");
  const [tags, setTags] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const signalRProgress = useSignalR();

  async function handleUpload() {
    if (!file || uploading) return;

    setUploading(true);
    setProgress(15);
    setStatusMessage("Envoi du fichier au serveur...");
    setIsSuccess(false);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", category);
      if (tags) fd.append("tags", tags);

      setProgress(40);
      setStatusMessage("Découpage sémantique (chunking)...");

      const { data } = await api.post("/documents/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setProgress(90);
      setStatusMessage("Calcul des représentations vectorielles...");

      setTimeout(() => {
        setProgress(100);
        setStatusMessage(`Document « ${data.title} » indexé avec succès.`);
        setIsSuccess(true);
        setUploading(false);
        setFile(null);
        setTags("");
        qc.invalidateQueries({ queryKey: ["docs"] });
        qc.invalidateQueries({ queryKey: ["mine"] });
        qc.invalidateQueries({ queryKey: ["stats"] });
      }, 600);
    } catch {
      setStatusMessage("Erreur lors de l'indexation du document.");
      setUploading(false);
      setProgress(0);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div>
        <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
          <UploadCloud size={18} className="text-primary" /> Importer un document
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Formats acceptés : PDF, DOCX, XLSX, TXT, MD (jusqu&apos;à 25 Mo).
        </p>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleFileDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`group flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:scale-105 transition-transform">
          <UploadCloud size={24} />
        </div>

        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground truncate max-w-xs">{file.name}</p>
            <p className="text-xs text-muted-foreground font-mono">
              {(file.size / 1024).toFixed(1)} Ko
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Glissez-déposez votre document ici
            </p>
            <p className="text-xs text-muted-foreground">ou cliquez pour parcourir vos fichiers</p>
          </div>
        )}
      </div>

      {/* Category selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">Catégorie</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tags input */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">Mots-clés / Tags</label>
        <Input
          placeholder="Ex: télétravail, sécurité, mutuelle (séparés par virgule)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="space-y-1.5 pt-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{statusMessage}</span>
            <span className="font-mono font-semibold text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Success notification */}
      {isSuccess && statusMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Action Button */}
      <Button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full shadow-sm"
      >
        <Sparkles size={16} />
        {uploading ? "Indexation vectorielle en cours…" : "Lancer l'indexation RAG"}
      </Button>
    </div>
  );
}
