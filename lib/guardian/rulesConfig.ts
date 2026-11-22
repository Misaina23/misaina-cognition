import { load as parseYaml } from "js-yaml";
import { z } from "zod";
import type { AnomalySeverity } from "./types";

const SeveritySchema = z.enum(["bloquante", "a_verifier", "mineure"]);

/**
 * Schéma Zod validant le fichier de règles YAML d'un espace/projet.
 */
export const ProjectRulesSchema = z.object({
  version: z.number().int().positive().default(1),
  projectName: z.string().default("Projet Standard"),
  requiredFields: z
    .array(
      z.object({
        field: z.enum(["fullName", "phone", "email", "age", "amount", "recordedAt", "zone", "externalId"]),
        severity: SeveritySchema.default("bloquante"),
        label: z.string().optional(),
      })
    )
    .default([
      { field: "fullName", severity: "bloquante", label: "Nom complet" },
      { field: "zone", severity: "a_verifier", label: "Zone géographique" },
      { field: "phone", severity: "mineure", label: "Téléphone" },
    ]),
  ranges: z
    .object({
      age: z
        .object({
          min: z.number().default(0),
          max: z.number().default(110),
          severity: SeveritySchema.default("bloquante"),
        })
        .optional(),
      amount: z
        .object({
          min: z.number().default(0),
          max: z.number().default(50000),
          severity: SeveritySchema.default("a_verifier"),
        })
        .optional(),
      recordedAt: z
        .object({
          minYear: z.number().int().default(2015),
          allowFutureDays: z.number().int().default(1),
          severity: SeveritySchema.default("a_verifier"),
        })
        .optional(),
    })
    .default({}),
  geoBounds: z
    .object({
      enabled: z.boolean().default(true),
      zoneName: z.string().default("Zone d'intervention"),
      minLat: z.number(),
      maxLat: z.number(),
      minLon: z.number(),
      maxLon: z.number(),
      rejectZeroZero: z.boolean().default(true),
      severity: SeveritySchema.default("bloquante"),
      mismatchSeverity: SeveritySchema.default("a_verifier"),
      interventionZones: z
        .array(
          z.object({
            name: z.string().min(1),
            minLat: z.number(),
            maxLat: z.number(),
            minLon: z.number(),
            maxLon: z.number(),
            severity: SeveritySchema.optional(),
          })
        )
        .default([]),
    })
    .optional(),
  duplicateDetection: z
    .object({
      exactBusinessKeyFields: z.array(z.string()).default(["fullName", "phone"]),
      exactSeverity: SeveritySchema.default("bloquante"),
      nearDuplicate: z
        .object({
          enabled: z.boolean().default(true),
          autoMergeThreshold: z.number().min(0.5).max(1).default(0.95),
          reviewThreshold: z.number().min(0.5).max(1).default(0.8),
          severity: SeveritySchema.default("a_verifier"),
        })
        .default({
          enabled: true,
          autoMergeThreshold: 0.95,
          reviewThreshold: 0.8,
          severity: "a_verifier",
        }),
    })
    .default({
      exactBusinessKeyFields: ["fullName", "phone"],
      exactSeverity: "bloquante",
      nearDuplicate: {
        enabled: true,
        autoMergeThreshold: 0.95,
        reviewThreshold: 0.8,
        severity: "a_verifier",
      },
    }),
  guardrails: z
    .object({
      maxAbnormalAnomalyRatio: z.number().min(0.05).max(1).default(0.45),
      maxActionsPerRun: z.number().int().positive().default(60),
      maxTokensPerRun: z.number().int().positive().default(16000),
      minAgentConfidence: z.number().min(0).max(1).default(0.65),
    })
    .default({
      maxAbnormalAnomalyRatio: 0.45,
      maxActionsPerRun: 60,
      maxTokensPerRun: 16000,
      minAgentConfidence: 0.65,
    }),
});

export type ProjectRulesConfig = z.infer<typeof ProjectRulesSchema>;

/**
 * Configuration YAML par défaut appliquée lorsqu'un espace n'a pas encore défini ses règles.
 * Zone GPS couvrant largement l'Afrique de l'Ouest / Sahel (modifiable par projet).
 */
export const DEFAULT_PROJECT_RULES_YAML = `version: 1
projectName: "Référentiel Qualité Bénéficiaires"
requiredFields:
  - field: fullName
    severity: bloquante
    label: "Nom complet du bénéficiaire"
  - field: zone
    severity: a_verifier
    label: "Localité / Zone"
  - field: phone
    severity: mineure
    label: "Téléphone de contact"
ranges:
  age:
    min: 0
    max: 110
    severity: bloquante
  amount:
    min: 0
    max: 25000
    severity: a_verifier
  recordedAt:
    minYear: 2018
    allowFutureDays: 1
    severity: a_verifier
geoBounds:
  enabled: true
  zoneName: "Bassin Sahel & Afrique de l'Ouest"
  minLat: 4.0
  maxLat: 27.5
  minLon: -18.0
  maxLon: 16.5
  rejectZeroZero: true
  severity: bloquante
  mismatchSeverity: a_verifier
  interventionZones:
    - name: "Dakar"
      minLat: 14.55
      maxLat: 14.88
      minLon: -17.55
      maxLon: -17.15
    - name: "Thiès"
      minLat: 14.60
      maxLat: 15.05
      minLon: -17.15
      maxLon: -16.65
    - name: "Kaolack"
      minLat: 13.95
      maxLat: 14.35
      minLon: -16.30
      maxLon: -15.85
    - name: "Saint-Louis"
      minLat: 15.80
      maxLat: 16.25
      minLon: -16.65
      maxLon: -16.25
    - name: "Ziguinchor"
      minLat: 12.40
      maxLat: 12.75
      minLon: -16.45
      maxLon: -16.05
duplicateDetection:
  exactBusinessKeyFields:
    - fullName
    - phone
  exactSeverity: bloquante
  nearDuplicate:
    enabled: true
    autoMergeThreshold: 0.95
    reviewThreshold: 0.80
    severity: a_verifier
guardrails:
  maxAbnormalAnomalyRatio: 0.45
  maxActionsPerRun: 60
  maxTokensPerRun: 16000
  minAgentConfidence: 0.65
`;

/**
 * Parse et valide un contenu YAML de règles projet.
 */
export function parseProjectRulesYaml(yamlText: string): {
  config: ProjectRulesConfig;
  rawYaml: string;
} {
  const parsed = parseYaml(yamlText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Le fichier YAML des règles doit contenir un objet de configuration.");
  }
  const config = ProjectRulesSchema.parse(parsed);
  return { config, rawYaml: yamlText };
}

export function severityWeight(sev: AnomalySeverity): number {
  if (sev === "bloquante") return 3;
  if (sev === "a_verifier") return 2;
  return 1;
}
