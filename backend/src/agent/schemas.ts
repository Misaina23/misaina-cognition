import { z } from "zod";

export const ToolArgSchemas = {
  list_anomalies: z.object({
    severity: z.enum(["bloquante", "a_verifier", "mineure"]).optional(),
    onlyOpen: z.boolean().default(true),
  }),
  find_similar: z.object({
    recordId: z.string().min(1),
    minScore: z.number().min(0).max(1).default(0.7),
  }),
  compare_records: z.object({
    recordIdA: z.string().min(1),
    recordIdB: z.string().min(1),
  }),
  propose_merge: z.object({
    primaryRecordId: z.string().min(1),
    secondaryRecordId: z.string().min(1),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3),
  }),
  archive_record: z.object({
    recordId: z.string().min(1),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3),
  }),
  request_validation: z.object({
    actionType: z.enum(["merge", "archive", "review_batch"]),
    title: z.string().min(3),
    description: z.string().min(3),
    primaryRecordId: z.string().min(1),
    secondaryRecordId: z.string().optional(),
    anomalyId: z.string().optional(),
    confidence: z.number().min(0).max(1),
  }),
  write_summary: z.object({
    summaryText: z.string().min(5),
    overallConfidence: z.number().min(0).max(1),
    needsHumanReview: z.boolean().default(false),
  }),
};

export const AgentVerdictSchema = z.object({
  decision: z.enum(["completed", "awaiting_validation", "aborted_low_confidence"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(5),
  actionsTaken: z.array(z.string()).default([]),
});

export type AgentVerdict = z.infer<typeof AgentVerdictSchema>;
