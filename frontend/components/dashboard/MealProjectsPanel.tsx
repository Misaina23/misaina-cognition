"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  RotateCcw,
  Upload,
} from "lucide-react";
import {
  describeApiError,
  guardianApi,
  type MealImportPreview,
  type MealProject,
  type MealValueValidation,
} from "@/lib/api";

function asBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Lecture du rapport impossible."));
    reader.readAsDataURL(file);
  });
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const statusNames: Record<string, string> = {
  on_track: "En bonne voie",
  late: "En retard",
  critical: "Critique",
  no_data: "Donnée manquante",
};

const statusStyles: Record<string, string> = {
  on_track: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  late: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "bg-red-500/10 text-red-700 dark:text-red-300",
  no_data: "bg-muted text-muted-foreground",
};

export function MealProjectsPanel({ spaceId }: { spaceId: string }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [projects, setProjects] = useState<MealProject[]>([]);
  const [pendingValues, setPendingValues] = useState<MealValueValidation[]>([]);
  const [actions, setActions] = useState<Array<{ id: string; action: string; timestamp: string; reversible: boolean; revertedAt?: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateObjective, setShowCreateObjective] = useState(false);
  const [showCreateIndicator, setShowCreateIndicator] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: "",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    zone: "",
    donor: "",
  });
  const [objectiveForm, setObjectiveForm] = useState({ type: "specific" as "global" | "specific", label: "" });
  const [indicatorForm, setIndicatorForm] = useState({
    objectiveId: "",
    name: "",
    unit: "personnes",
    baseline: "",
    target: "",
    direction: "increase" as "increase" | "decrease",
    frequency: "monthly" as "monthly" | "quarterly" | "annual",
    periodType: "cumulative" as "cumulative" | "monthly",
    verificationSource: "",
    aliases: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState("");
  const [preview, setPreview] = useState<MealImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [periodHeader, setPeriodHeader] = useState("");
  const [summary, setSummary] = useState<{ projectId: string; period: string; text: string } | null>(null);
  const [targetEdit, setTargetEdit] = useState<{
    indicatorId: string;
    target: string;
    effectiveAt: string;
    reason: string;
  } | null>(null);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0];
  const selectedProgress = useMemo(
    () => selectedProject?.objectives ?? [],
    [selectedProject]
  );
  const objectiveOptions = useMemo(
    () => selectedProgress.map((group) => group.objective),
    [selectedProgress]
  );

  const refresh = useCallback(async () => {
    try {
      const result = await guardianApi.getMealProjects(spaceId, period);
      setProjects(result.projects);
      setPendingValues(result.pendingValues);
      setActions(result.actions);
      setSelectedProjectId((current) =>
        result.projects.some((project) => project.id === current)
          ? current
          : result.projects[0]?.id ?? ""
      );
    } catch (error) {
      setMessage(describeApiError(error));
    }
  }, [spaceId, period]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setPreview(null);
    setMapping({});
    setFileBase64("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("L’import de suivi de projet accepte les fichiers Excel .xlsx et PDF texte.");
      return;
    }
    try {
      const encoded = await asBase64(file);
      setFileBase64(encoded);
      const result = await guardianApi.previewMealImport(spaceId, file.name, encoded);
      setPreview(result);
      setPeriodHeader(result.headers.find((header) => /p[ée]riode|mois|date/i.test(header)) || "");
      setMapping(
        Object.fromEntries(
          Object.entries(result.suggestions)
            .filter((entry): entry is [string, { indicatorId: string; confidence: number }] => Boolean(entry[1]))
            .map(([header, suggestion]) => [header, suggestion.indicatorId])
        )
      );
    } catch (error) {
      setMessage(describeApiError(error));
    }
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(
      async () => {
        await guardianApi.createMealProject(spaceId, projectForm);
        setProjectForm({ name: "", startDate: new Date().toISOString().slice(0, 10), endDate: "", zone: "", donor: "" });
        setShowCreateProject(false);
      },
      "Projet créé."
    );
  }

  async function handleCreateObjective(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    await runAction(
      async () => {
        await guardianApi.createMealObjective(spaceId, selectedProject.id, objectiveForm);
        setObjectiveForm({ type: "specific", label: "" });
        setShowCreateObjective(false);
      },
      "Objectif créé."
    );
  }

  async function handleCreateIndicator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject) return;
    await runAction(
      async () => {
        await guardianApi.createMealIndicator(spaceId, selectedProject.id, {
          ...indicatorForm,
          baseline: Number(indicatorForm.baseline),
          target: Number(indicatorForm.target),
          aliases: indicatorForm.aliases.split(",").map((item) => item.trim()).filter(Boolean),
        });
        setIndicatorForm((current) => ({ ...current, name: "", baseline: "", target: "", verificationSource: "", aliases: "" }));
        setShowCreateIndicator(false);
      },
      "Indicateur créé."
    );
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !selectedFile || !fileBase64) return;
    await runAction(
      async () => {
        const result = await guardianApi.importMealReport({
          spaceId,
          projectId: selectedProject.id,
          fileName: selectedFile.name,
          fileBase64,
          ...(periodHeader ? { periodHeader } : { period }),
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, indicatorId]) => indicatorId)),
        });
        setMessage(`${result.inserted} valeur(s) importée(s), ${result.proposed} en attente de validation, ${result.skippedIdempotent} doublon(s) ignoré(s).`);
        setSelectedFile(null);
        setPreview(null);
        setFileBase64("");
      },
      "Import terminé."
    );
  }

  async function handleSummary() {
    if (!selectedProject) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await guardianApi.summarizeMealProject(spaceId, selectedProject.id, period);
      setSummary({ projectId: selectedProject.id, period, text: result.summary });
      const limitNote = result.fallbackReason ? " Limite atteinte : résumé de secours déterministe utilisé." : "";
      const contextNote = result.partialContext ? " Analyse partielle : une partie des données dépasse la limite de contexte." : "";
      setMessage(`Résumé généré par ${result.provider} (${result.model}) · ${result.llmCalls} appel(s), ${result.tokensUsed} tokens, coût estimé ${result.costUsd.toFixed(4)} USD.${limitNote}${contextNote}`);
      await refresh();
    } catch (error) {
      setMessage(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleTargetChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !targetEdit) return;
    await runAction(
      () =>
        guardianApi.changeMealIndicatorTarget(spaceId, selectedProject.id, targetEdit.indicatorId, {
          target: Number(targetEdit.target),
          effectiveAt: targetEdit.effectiveAt,
          reason: targetEdit.reason,
        }),
      "Cible modifiée ; la nouvelle version est historisée."
    );
    setTargetEdit(null);
  }

  async function handleExport(format: "xlsx" | "docx") {
    if (!selectedProject) return;
    setBusy(true);
    try {
      const result = await guardianApi.downloadMealReport(spaceId, selectedProject.id, period, format);
      download(result.blob, result.fileName);
    } catch (error) {
      setMessage(describeApiError(error));
    } finally {
      setBusy(false);
    }
  }

  const projectIndicators = selectedProgress.flatMap((group) => group.indicators);

  return (
    <div className="space-y-5">
      {message && (
        <div role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-xs">
          {message}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Suivi des projets MEAL</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Objectifs, indicateurs, preuves et progression calculée automatiquement.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">
              Période
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                className="ml-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </label>
            <button type="button" onClick={() => void refresh()} className="rounded-md border border-border p-2" aria-label="Actualiser les projets">
              <RefreshCw size={14} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreateProject((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            >
              <Plus size={14} /> Nouveau projet
            </button>
          </div>
        </div>

        {showCreateProject && (
          <form onSubmit={handleCreateProject} className="mt-4 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-3">
            <input required minLength={2} placeholder="Nom du projet" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
            <input required type="date" aria-label="Début du projet" value={projectForm.startDate} onChange={(event) => setProjectForm({ ...projectForm, startDate: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
            <input required type="date" aria-label="Fin du projet" value={projectForm.endDate} onChange={(event) => setProjectForm({ ...projectForm, endDate: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
            <input placeholder="Zone d’intervention" value={projectForm.zone} onChange={(event) => setProjectForm({ ...projectForm, zone: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
            <input placeholder="Bailleur" value={projectForm.donor} onChange={(event) => setProjectForm({ ...projectForm, donor: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
            <button disabled={busy} className="rounded bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50">Créer le projet</button>
          </form>
        )}

        {projects.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium">Aucun projet de suivi dans cet espace.</p>
            <p className="mt-1 text-xs text-muted-foreground">Créez un projet pour définir ses objectifs et indicateurs.</p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {projects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  aria-pressed={selectedProject?.id === project.id}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedProject?.id === project.id ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  <span className="block font-semibold">{project.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{project.zone || "Zone non renseignée"} · {project.donor || "Bailleur non renseigné"}</span>
                </button>
              ))}
            </div>

            {selectedProject && (
              <>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                  <div className="text-xs text-muted-foreground">
                    Période projet : {selectedProject.startDate} – {selectedProject.endDate}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setShowCreateObjective((value) => !value)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs"><Plus size={12} /> Objectif</button>
                    <button type="button" onClick={() => setShowCreateIndicator((value) => !value)} disabled={objectiveOptions.length === 0} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-50"><Plus size={12} /> Indicateur</button>
                    <button type="button" disabled={busy} onClick={() => void handleSummary()} className="rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-50">Résumé mensuel</button>
                    <button type="button" disabled={busy} onClick={() => void handleExport("xlsx")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs"><FileSpreadsheet size={12} /> Excel</button>
                    <button type="button" disabled={busy} onClick={() => void handleExport("docx")} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs"><FileText size={12} /> .docx</button>
                  </div>
                </div>

                {showCreateObjective && (
                  <form onSubmit={handleCreateObjective} className="mt-3 flex flex-wrap gap-2 rounded-lg border border-border bg-background p-3">
                    <select value={objectiveForm.type} onChange={(event) => setObjectiveForm({ ...objectiveForm, type: event.target.value as "global" | "specific" })} className="rounded border border-border bg-card px-2 py-2 text-xs">
                      <option value="global">Objectif global</option><option value="specific">Objectif spécifique</option>
                    </select>
                    <input required minLength={2} placeholder="Libellé de l’objectif" value={objectiveForm.label} onChange={(event) => setObjectiveForm({ ...objectiveForm, label: event.target.value })} className="min-w-60 flex-1 rounded border border-border bg-card px-2 py-2 text-xs" />
                    <button disabled={busy} className="rounded bg-foreground px-3 py-2 text-xs text-background">Ajouter</button>
                  </form>
                )}
                {showCreateIndicator && (
                  <form onSubmit={handleCreateIndicator} className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-3">
                    <select required value={indicatorForm.objectiveId} onChange={(event) => setIndicatorForm({ ...indicatorForm, objectiveId: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs">
                      <option value="">Objectif lié</option>{objectiveOptions.map((objective) => <option key={objective.id} value={objective.id}>{objective.type === "global" ? "Global" : "Spécifique"} — {objective.label}</option>)}
                    </select>
                    <input required placeholder="Nom de l’indicateur" value={indicatorForm.name} onChange={(event) => setIndicatorForm({ ...indicatorForm, name: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input required placeholder="Unité (%, personnes…)" value={indicatorForm.unit} onChange={(event) => setIndicatorForm({ ...indicatorForm, unit: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input required type="number" step="any" placeholder="Baseline" value={indicatorForm.baseline} onChange={(event) => setIndicatorForm({ ...indicatorForm, baseline: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input required type="number" step="any" placeholder="Cible" value={indicatorForm.target} onChange={(event) => setIndicatorForm({ ...indicatorForm, target: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <select value={indicatorForm.direction} onChange={(event) => setIndicatorForm({ ...indicatorForm, direction: event.target.value as "increase" | "decrease" })} className="rounded border border-border bg-card px-2 py-2 text-xs"><option value="increase">Hausse souhaitée</option><option value="decrease">Baisse souhaitée</option></select>
                    <select value={indicatorForm.frequency} onChange={(event) => setIndicatorForm({ ...indicatorForm, frequency: event.target.value as "monthly" | "quarterly" | "annual" })} className="rounded border border-border bg-card px-2 py-2 text-xs"><option value="monthly">Fréquence mensuelle</option><option value="quarterly">Trimestrielle</option><option value="annual">Annuelle</option></select>
                    <select value={indicatorForm.periodType} onChange={(event) => setIndicatorForm({ ...indicatorForm, periodType: event.target.value as "cumulative" | "monthly" })} className="rounded border border-border bg-card px-2 py-2 text-xs"><option value="cumulative">Valeur cumulative</option><option value="monthly">Valeur mensuelle</option></select>
                    <input required placeholder="Source de vérification" value={indicatorForm.verificationSource} onChange={(event) => setIndicatorForm({ ...indicatorForm, verificationSource: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input placeholder="Alias d’en-têtes (séparés par virgule)" value={indicatorForm.aliases} onChange={(event) => setIndicatorForm({ ...indicatorForm, aliases: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <button disabled={busy} className="rounded bg-foreground px-3 py-2 text-xs text-background">Créer l’indicateur</button>
                  </form>
                )}

                {selectedProgress.length === 0 ? (
                  <p className="mt-5 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Ajoutez un objectif pour commencer le cadre logique du projet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {selectedProgress.map(({ objective, indicators }) => (
                      <section key={objective.id} className="overflow-hidden rounded-lg border border-border">
                        <div className="bg-muted/40 px-3 py-2 text-xs font-semibold">{objective.type === "global" ? "Objectif global" : "Objectif spécifique"} · {objective.label}</div>
                        {indicators.length === 0 ? (
                          <p className="px-3 py-4 text-xs text-muted-foreground">Aucun indicateur lié.</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left text-xs">
                              <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
                                <tr><th className="px-3 py-2">Indicateur</th><th className="px-3 py-2">Baseline → Cible</th><th className="px-3 py-2">Valeur</th><th className="px-3 py-2">Progression</th><th className="px-3 py-2">Attendue</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Source / confiance</th></tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {indicators.map((item) => (
                                  <tr key={item.indicator.id}>
                                    <td className="px-3 py-3"><span className="font-medium">{item.indicator.name}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{item.indicator.frequency} · {item.indicator.periodType === "cumulative" ? "cumulatif" : "mensuel"}</span></td>
                                    <td title={item.indicator.targetHistory.map((revision) => `${revision.effectiveAt}: ${revision.target} (${revision.reason})`).join("\n")} className="px-3 py-3 tabular-nums">
                                      {item.indicator.baseline} → {item.targetAtPeriod} {item.indicator.unit}
                                      <button
                                        type="button"
                                        onClick={() => setTargetEdit({
                                          indicatorId: item.indicator.id,
                                          target: String(item.indicator.target),
                                          effectiveAt: new Date().toISOString().slice(0, 10),
                                          reason: "",
                                        })}
                                        className="ml-2 text-[10px] text-primary hover:underline"
                                      >
                                        Modifier
                                      </button>
                                    </td>
                                    <td className="px-3 py-3 tabular-nums">{item.currentValue ? `${item.currentValue.value} ${item.indicator.unit}` : "—"}</td>
                                    <td className="px-3 py-3">
                                      <div className="font-mono font-semibold tabular-nums">{item.actualPercent === null ? "—" : `${item.actualPercent}%`}</div>
                                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, item.actualPercent ?? 0))}%` }} /></div>
                                    </td>
                                    <td className="px-3 py-3 font-mono tabular-nums">{item.expectedPercent}%</td>
                                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-medium ${statusStyles[item.status]}`}>{statusNames[item.status]}</span></td>
                                    <td className="max-w-48 px-3 py-3 text-[10px] text-muted-foreground">{item.currentValue ? <>{item.currentValue.sourceFile} · {item.currentValue.sourceLocation}<br />Confiance {(item.currentValue.confidence * 100).toFixed(0)} %</> : item.indicator.verificationSource}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                )}
                {targetEdit && (
                  <form onSubmit={handleTargetChange} className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-3 sm:grid-cols-4">
                    <input required type="number" step="any" aria-label="Nouvelle cible" value={targetEdit.target} onChange={(event) => setTargetEdit({ ...targetEdit, target: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input required type="date" aria-label="Date d’effet de la cible" value={targetEdit.effectiveAt} onChange={(event) => setTargetEdit({ ...targetEdit, effectiveAt: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <input required minLength={2} placeholder="Motif du changement" value={targetEdit.reason} onChange={(event) => setTargetEdit({ ...targetEdit, reason: event.target.value })} className="rounded border border-border bg-card px-2 py-2 text-xs" />
                    <div className="flex gap-2">
                      <button disabled={busy} className="rounded bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50">Enregistrer la cible</button>
                      <button type="button" onClick={() => setTargetEdit(null)} className="rounded border border-border px-3 py-2 text-xs">Fermer</button>
                    </div>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </section>

      {selectedProject && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Upload size={15} className="text-primary" /> Importer un rapport mensuel Excel ou PDF</h3>
            <p className="mt-1 text-xs text-muted-foreground">Les en-têtes/ lignes sont rapprochés des indicateurs ; vérifiez le mapping avant import. Les extractions PDF restent toujours à valider et les PDF scannés nécessitent un OCR.</p>
            <form onSubmit={handleImport} className="mt-3 space-y-3">
              <input type="file" accept=".xlsx,.pdf" onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)} className="block w-full text-xs text-muted-foreground" />
              {preview && (
                <div className="space-y-2 rounded-lg border border-border bg-background p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] text-muted-foreground">Colonne période (facultatif)
                      <select value={periodHeader} onChange={(event) => setPeriodHeader(event.target.value)} className="mt-1 w-full rounded border border-border bg-card px-2 py-1.5 text-xs"><option value="">Utiliser {period}</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select>
                    </label>
                    <div className="text-[11px] text-muted-foreground">Aperçu : {preview.rows.length} ligne(s) · seules les valeurs numériques seront importées.</div>
                  </div>
                  <div className="max-h-60 space-y-2 overflow-auto">
                    {preview.headers.filter((header) => Object.prototype.hasOwnProperty.call(preview.suggestions, header)).map((header) => (
                      <label key={header} className="grid grid-cols-2 items-center gap-2 text-xs">
                        <span className="truncate" title={header}>{header}</span>
                        <select value={mapping[header] ?? ""} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value })} className="min-w-0 rounded border border-border bg-card px-2 py-1.5 text-xs">
                          <option value="">Ne pas importer</option>
                          {projectIndicators.map((item) => <option key={item.indicator.id} value={item.indicator.id}>{item.indicator.name}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                  {preview.rows.slice(0, 3).map((row) => (
                    <div key={row.rowNumber} className="overflow-x-auto border-t border-border pt-2 text-[10px] text-muted-foreground">
                      Ligne {row.rowNumber}: {Object.entries(row.cells).map(([header, value]) => `${header}=${value instanceof Date ? value.toISOString().slice(0, 10) : String(value)}`).join(" · ")}
                    </div>
                  ))}
                </div>
              )}
              <button type="submit" disabled={!selectedFile || !preview || busy || Object.values(mapping).filter(Boolean).length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"><FileSpreadsheet size={13} /> Importer les valeurs</button>
            </form>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={15} className="text-primary" /> File de validations ({pendingValues.length})</h3>
            </div>
            {pendingValues.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">Aucune valeur en attente.</p>
            ) : (
              <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                {pendingValues.filter((value) => value.projectId === selectedProject.id).map((value) => {
                  const indicator = projectIndicators.find((item) => item.indicator.id === value.indicatorId)?.indicator;
                  return (
                    <div key={value.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                      <div className="font-semibold">{indicator?.name ?? "Indicateur"} · {value.period} · {value.value} {indicator?.unit}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{value.sourceFile} · {value.sourceLocation} · confiance {(value.confidence * 100).toFixed(0)} %</div>
                      {value.reviewNote && <div className="mt-1 text-[10px] text-amber-800 dark:text-amber-300">À vérifier : {value.reviewNote}</div>}
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy} onClick={() => void runAction(() => guardianApi.decideMealValue(spaceId, value.id, "validated"), "Valeur validée.")} className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white">Valider</button>
                        <button type="button" disabled={busy} onClick={() => void runAction(() => guardianApi.decideMealValue(spaceId, value.id, "rejected"), "Valeur rejetée.")} className="rounded border border-border px-2.5 py-1 text-[11px]">Rejeter</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {summary && summary.projectId === selectedProject?.id && summary.period === period && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Brouillon de résumé MEAL — {period}</h3>
          <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Synthèse assistée par IA : vérifiez les chiffres et le contexte avant diffusion.</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{summary.text}</p>
        </section>
      )}

      {actions.some((action) => action.reversible && !action.revertedAt) && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-xs font-semibold">Journal des actions du module</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.filter((action) => action.reversible && !action.revertedAt).slice(0, 5).map((action) => (
              <button key={action.id} type="button" disabled={busy} onClick={() => void runAction(() => guardianApi.undoMealAction(spaceId, action.id), "Action annulée.")} className="inline-flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground disabled:opacity-50" title={action.action}>
                <RotateCcw size={11} /> Annuler {action.action.replace("meal_", "")} · {new Date(action.timestamp).toLocaleString("fr-FR")}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
