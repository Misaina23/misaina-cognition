import { mockDb } from "../server/mockDb";
import { guardianRepo } from "./repository";
import type { AgentAction, NormalizedRecord, TenantSpaceContext, ValidationItem } from "./types";

/**
 * Exécute une fusion réversible (aucune suppression) : l'enregistrement secondaire
 * passe à `status = "merged"` avec un `snapshotBefore` complet pour rollback.
 */
export function executeReversibleMerge(params: {
  ctx: TenantSpaceContext;
  runId: string;
  primaryRecordId: string;
  secondaryRecordId: string;
  anomalyId?: string;
  confidence: number;
  author: "agent" | "human";
  reason: string;
}): { action: AgentAction; mergedRecord: NormalizedRecord } {
  const { ctx, runId, primaryRecordId, secondaryRecordId, anomalyId, confidence, author, reason } = params;

  const primary = guardianRepo.getNormalizedRecord(ctx, primaryRecordId);
  const secondary = guardianRepo.getNormalizedRecord(ctx, secondaryRecordId);

  if (!primary || !secondary) {
    throw new Error("Enregistrement introuvable dans cet espace pour fusion.");
  }
  if (primary.id === secondary.id) {
    throw new Error("Impossible de fusionner un enregistrement avec lui-même.");
  }
  if (secondary.status !== "active") {
    throw new Error(`L'enregistrement ${secondary.externalId} n'est plus actif (${secondary.status}).`);
  }

  // Complète éventuellement les champs manquants du primaire depuis le secondaire (sans toucher au brut)
  const primaryBefore = {
    fullName: primary.fullName,
    phone: primary.phone,
    email: primary.email,
    age: primary.age,
    amount: primary.amount,
    zone: primary.zone,
    latitude: primary.latitude,
    longitude: primary.longitude,
  };
  const secondaryBefore = {
    status: secondary.status,
    mergedIntoId: secondary.mergedIntoId,
    archivedAt: secondary.archivedAt,
    archivedReason: secondary.archivedReason,
  };

  if (!primary.fullName && secondary.fullName) primary.fullName = secondary.fullName;
  if (!primary.phone && secondary.phone) primary.phone = secondary.phone;
  if (!primary.email && secondary.email) primary.email = secondary.email;
  if (primary.age === null && secondary.age !== null) primary.age = secondary.age;
  if (primary.zone === null && secondary.zone !== null) primary.zone = secondary.zone;
  if (primary.latitude === null && secondary.latitude !== null) {
    primary.latitude = secondary.latitude;
    primary.longitude = secondary.longitude;
  }
  primary.updatedAt = new Date().toISOString();

  secondary.status = "merged";
  secondary.mergedIntoId = primary.id;
  secondary.archivedAt = new Date().toISOString();
  secondary.archivedReason = reason;
  secondary.updatedAt = new Date().toISOString();

  if (anomalyId) {
    guardianRepo.updateAnomaly(ctx, anomalyId, {
      status: author === "agent" ? "auto_resolved" : "resolved",
    });
  }

  guardianRepo.updateSourceStats(ctx, secondary.sourceId, {});

  const action = guardianRepo.addAgentAction(ctx, {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "propose_merge",
    inputs: { primaryRecordId, secondaryRecordId, anomalyId, reason },
    output: { mergedRecordId: secondary.id, keptRecordId: primary.id, status: "merged" },
    decision: `Fusion réversible : ${secondary.externalId} -> ${primary.externalId}`,
    confidence,
    author,
    authorId: author === "human" ? ctx.userId : "guardian-agent",
    reversible: true,
    reverted: false,
    snapshotBefore: {
      primaryRecordId: primary.id,
      primaryBefore,
      secondaryRecordId: secondary.id,
      secondaryBefore,
      anomalyId,
    },
  });

  return { action, mergedRecord: secondary };
}

/**
 * Exécute un archivage réversible (aucune suppression) avec snapshot complet.
 */
export function executeReversibleArchive(params: {
  ctx: TenantSpaceContext;
  runId: string;
  recordId: string;
  anomalyId?: string;
  confidence: number;
  author: "agent" | "human";
  reason: string;
}): { action: AgentAction; archivedRecord: NormalizedRecord } {
  const { ctx, runId, recordId, anomalyId, confidence, author, reason } = params;
  const rec = guardianRepo.getNormalizedRecord(ctx, recordId);
  if (!rec) {
    throw new Error("Enregistrement introuvable dans cet espace pour archivage.");
  }
  if (rec.status !== "active") {
    throw new Error(`Enregistrement déjà ${rec.status}.`);
  }

  const before = {
    status: rec.status,
    archivedAt: rec.archivedAt,
    archivedReason: rec.archivedReason,
  };

  rec.status = "archived";
  rec.archivedAt = new Date().toISOString();
  rec.archivedReason = reason;
  rec.updatedAt = new Date().toISOString();

  if (anomalyId) {
    guardianRepo.updateAnomaly(ctx, anomalyId, {
      status: author === "agent" ? "auto_resolved" : "resolved",
    });
  }

  guardianRepo.updateSourceStats(ctx, rec.sourceId, {});

  const action = guardianRepo.addAgentAction(ctx, {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId,
    timestamp: new Date().toISOString(),
    toolName: "archive_record",
    inputs: { recordId, anomalyId, reason },
    output: { recordId: rec.id, status: "archived" },
    decision: `Archivage restaurable de ${rec.externalId} (${reason})`,
    confidence,
    author,
    authorId: author === "human" ? ctx.userId : "guardian-agent",
    reversible: true,
    reverted: false,
    snapshotBefore: {
      recordId: rec.id,
      before,
      anomalyId,
    },
  });

  return { action, archivedRecord: rec };
}

/**
 * Annule (rollback) une action automatique ou humaine exécutée dans (tenantId, spaceId).
 */
export function rollbackAgentAction(
  ctx: TenantSpaceContext,
  actionId: string
): AgentAction {
  const action = guardianRepo.listAgentActions(ctx).find((a) => a.id === actionId);
  if (!action) {
    throw new Error("Action introuvable dans cet espace.");
  }
  if (!action.reversible || !action.snapshotBefore) {
    throw new Error("Cette action n'est pas réversible.");
  }
  if (action.reverted) {
    throw new Error("Cette action a déjà été annulée.");
  }

  const snap = action.snapshotBefore;

  if (action.toolName === "propose_merge") {
    const primary = guardianRepo.getNormalizedRecord(ctx, String(snap.primaryRecordId));
    const secondary = guardianRepo.getNormalizedRecord(ctx, String(snap.secondaryRecordId));

    if (primary && snap.primaryBefore) {
      Object.assign(primary, snap.primaryBefore, { updatedAt: new Date().toISOString() });
    }
    if (secondary && snap.secondaryBefore) {
      const sb = snap.secondaryBefore as Record<string, unknown>;
      secondary.status = (sb.status as NormalizedRecord["status"]) || "active";
      secondary.mergedIntoId = sb.mergedIntoId as string | undefined;
      secondary.archivedAt = sb.archivedAt as string | undefined;
      secondary.archivedReason = sb.archivedReason as string | undefined;
      secondary.updatedAt = new Date().toISOString();
      guardianRepo.updateSourceStats(ctx, secondary.sourceId, {});
    }
  } else if (action.toolName === "archive_record") {
    const rec = guardianRepo.getNormalizedRecord(ctx, String(snap.recordId));
    if (rec && snap.before) {
      const b = snap.before as Record<string, unknown>;
      rec.status = (b.status as NormalizedRecord["status"]) || "active";
      rec.archivedAt = b.archivedAt as string | undefined;
      rec.archivedReason = b.archivedReason as string | undefined;
      rec.updatedAt = new Date().toISOString();
      guardianRepo.updateSourceStats(ctx, rec.sourceId, {});
    }
  }

  if (snap.anomalyId) {
    guardianRepo.updateAnomaly(ctx, String(snap.anomalyId), { status: "open" });
  }

  action.reverted = true;
  action.revertedAt = new Date().toISOString();
  action.revertedBy = ctx.userId;

  // Trace l'annulation dans le journal d'audit et agent_actions
  guardianRepo.addAgentAction(ctx, {
    id: `act-rb-${Date.now()}`,
    tenantId: ctx.tenantId,
    spaceId: ctx.spaceId,
    runId: action.runId,
    timestamp: new Date().toISOString(),
    toolName: "rollback_action",
    inputs: { revertedActionId: action.id },
    output: { restored: true },
    decision: `Annulation humaine de l'action ${action.toolName} (${action.id})`,
    confidence: 1,
    author: "human",
    authorId: ctx.userId,
    reversible: false,
    reverted: false,
  });

  mockDb.auditLogs.unshift({
    id: `aud-rb-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userId: ctx.userId,
    userName: "Utilisateur Habilité",
    userEmail: "guardian@misaina.internal",
    department: ctx.tenantId,
    action: "CONNECTOR_SYNC",
    queryOrTarget: `Annulation action Gardien ${action.id} (${action.toolName})`,
    dlpStatus: "CONFORME",
    sourcesCount: 1,
    latencyMs: 25,
    hashSignature: `sha256-rb-${Date.now()}`,
  });

  return action;
}

/**
 * Traite une décision humaine (Valider / Rejeter) sur la file d'attente de validation.
 */
export function resolveValidationItem(
  ctx: TenantSpaceContext,
  validationId: string,
  decision: "approved" | "rejected"
): { item: ValidationItem; executedAction?: AgentAction } {
  const item = guardianRepo.listValidations(ctx).find((v) => v.id === validationId);
  if (!item) {
    throw new Error("Élément de validation introuvable dans cet espace.");
  }
  if (item.status !== "pending") {
    throw new Error(`Cet élément a déjà été traité (${item.status}).`);
  }

  item.status = decision;
  item.decidedBy = ctx.userId;
  item.decidedAt = new Date().toISOString();

  let executedAction: AgentAction | undefined;

  if (decision === "approved") {
    if (item.actionType === "merge" && item.secondaryRecordId) {
      const res = executeReversibleMerge({
        ctx,
        runId: item.runId,
        primaryRecordId: item.primaryRecordId,
        secondaryRecordId: item.secondaryRecordId,
        anomalyId: item.anomalyId,
        confidence: item.confidence,
        author: "human",
        reason: `Validation humaine : ${item.title}`,
      });
      executedAction = res.action;
    } else if (item.actionType === "archive") {
      const res = executeReversibleArchive({
        ctx,
        runId: item.runId,
        recordId: item.primaryRecordId,
        anomalyId: item.anomalyId,
        confidence: item.confidence,
        author: "human",
        reason: `Validation humaine : ${item.title}`,
      });
      executedAction = res.action;
    } else if (item.actionType === "review_batch") {
      guardianRepo.addAgentAction(ctx, {
        id: `act-val-${Date.now()}`,
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runId: item.runId,
        timestamp: new Date().toISOString(),
        toolName: "human_review_batch",
        inputs: { validationId: item.id },
        output: { approved: true },
        decision: `Revue humaine approuvée : ${item.title}`,
        confidence: 1,
        author: "human",
        authorId: ctx.userId,
        reversible: false,
        reverted: false,
      });
    }
  } else {
    if (item.anomalyId) {
      guardianRepo.updateAnomaly(ctx, item.anomalyId, { status: "ignored" });
    }
    guardianRepo.addAgentAction(ctx, {
      id: `act-rej-${Date.now()}`,
      tenantId: ctx.tenantId,
      spaceId: ctx.spaceId,
      runId: item.runId,
      timestamp: new Date().toISOString(),
      toolName: "human_reject_validation",
      inputs: { validationId: item.id },
      output: { rejected: true },
      decision: `Proposition rejetée par l'utilisateur : ${item.title}`,
      confidence: 1,
      author: "human",
      authorId: ctx.userId,
      reversible: false,
      reverted: false,
    });
  }

  return { item, executedAction };
}
