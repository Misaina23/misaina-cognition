"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";

export function DocumentUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<string>("");

  async function upload() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    if (category) fd.append("category", category);
    if (tags) fd.append("tags", tags);
    setStatus("Indexation en cours…");
    const { data } = await api.post("/documents/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setStatus(`Document "${data.title}" - ${data.status}`);
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h3 className="font-semibold">Importer un document</h3>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.md" className="block w-full text-sm" />
      <Input placeholder="Catégorie" value={category} onChange={(e) => setCategory(e.target.value)} />
      <Input placeholder="Tags (séparés par virgule)" value={tags} onChange={(e) => setTags(e.target.value)} />
      <Button onClick={upload} disabled={!file}>Téléverser</Button>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}
