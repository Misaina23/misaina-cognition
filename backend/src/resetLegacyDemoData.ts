import fs from "node:fs";
import path from "node:path";
import { closePgPool, getPgPool, isPgEnabled } from "./pgStore";
import { tenantSpacesRegistry } from "./tenant";

const MIGRATION_ID = "reset-legacy-dakar-demo-v1";
const LEGACY_TENANT_ID = "tenant-operations-sahel-dakar";
const CURRENT_TENANT_ID = "tenant-operations-terrain-madagascar";
const DEMO_SPACE_ID = "space-u3-sahel";
const DEMO_SOURCE_ID = "src-u3-kobo";
const TENANT_SCOPED_TABLES = [
  "guardian_spaces",
  "guardian_sources",
  "guardian_raw_records",
  "guardian_normalized_records",
  "guardian_project_rules",
  "guardian_runs",
  "guardian_rule_feedback",
  "guardian_anomalies",
  "guardian_validations",
  "agent_actions",
  "knowledge_documents",
  "knowledge_queries",
  "knowledge_audit_ledger",
  "meal_projects",
  "meal_objectives",
  "meal_indicators",
  "meal_indicator_values",
  "meal_project_actions",
  "meal_project_summaries",
];

function getBackendRoot(): string {
  const cwd = process.cwd();
  return fs.existsSync(path.join(cwd, "config", "projects")) ? cwd : path.join(cwd, "backend");
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function writeJsonAtomically(filePath: string, value: Record<string, unknown>): void {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function tenantRows(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item) => !item || typeof item !== "object" || (item as { tenantId?: unknown }).tenantId !== LEGACY_TENANT_ID
  );
}

function migrateJournalFile(dataRoot: string): void {
  const filePath = path.join(dataRoot, "journal-state.json");
  const snapshot = readJson(filePath);
  if (!snapshot) return;

  const spaces = Array.isArray(snapshot.spaces) ? snapshot.spaces : [];
  const retainedSpaces = spaces.filter(
    (space) => !space || typeof space !== "object" || (space as { tenantId?: unknown }).tenantId !== LEGACY_TENANT_ID
  );
  const currentDemoSpace = tenantSpacesRegistry.find((space) => space.id === DEMO_SPACE_ID);
  if (currentDemoSpace && !retainedSpaces.some((space) => (space as { id?: unknown })?.id === DEMO_SPACE_ID)) {
    retainedSpaces.push(currentDemoSpace);
  }

  const sources = (Array.isArray(snapshot.sources) ? snapshot.sources : [])
    .filter((source) => !source || typeof source !== "object" || (source as { tenantId?: unknown }).tenantId !== LEGACY_TENANT_ID)
    .map((source) => {
      if (!source || typeof source !== "object" || (source as { id?: unknown }).id !== DEMO_SOURCE_ID) return source;
      return {
        ...source,
        tenantId: CURRENT_TENANT_ID,
        spaceId: DEMO_SPACE_ID,
        name: "KoboToolbox Enquête Madagascar",
        recordsCount: 0,
      };
    });
  if (!sources.some((source) => (source as { id?: unknown })?.id === DEMO_SOURCE_ID)) {
    sources.push({
      id: DEMO_SOURCE_ID,
      tenantId: CURRENT_TENANT_ID,
      spaceId: DEMO_SPACE_ID,
      name: "KoboToolbox Enquête Madagascar",
      type: "generic",
      format: "kobo",
      status: "ACTIVE",
      recordsCount: 0,
      createdAt: new Date().toISOString(),
    });
  }

  const rules = Array.isArray(snapshot.rulesYamlBySpace)
    ? snapshot.rulesYamlBySpace.filter(
        (entry) => !Array.isArray(entry) || typeof entry[0] !== "string" || !entry[0].startsWith(`${LEGACY_TENANT_ID}::`)
      )
    : [];

  writeJsonAtomically(filePath, {
    ...snapshot,
    spaces: retainedSpaces,
    sources,
    rawRecords: tenantRows(snapshot.rawRecords),
    normalizedRecords: tenantRows(snapshot.normalizedRecords),
    runs: tenantRows(snapshot.runs),
    anomalies: tenantRows(snapshot.anomalies),
    agentActions: tenantRows(snapshot.agentActions),
    validationQueue: tenantRows(snapshot.validationQueue),
    ruleFeedback: tenantRows(snapshot.ruleFeedback),
    rulesYamlBySpace: rules,
  });
}

function migrateUsersFile(dataRoot: string): void {
  const filePath = path.join(dataRoot, "users-state.json");
  const snapshot = readJson(filePath);
  if (!snapshot || !Array.isArray(snapshot.users)) return;
  const users = snapshot.users.map((user) => {
    if (!user || typeof user !== "object") return user;
    const candidate = user as { id?: unknown; department?: unknown };
    if (
      candidate.id === "u-3" &&
      (candidate.department === "Opérations Sahel - Dakar" || candidate.department === "Opérations terrain - Madagascar")
    ) {
      return { ...user, department: "Opérations terrain - Madagascar" };
    }
    return user;
  });
  writeJsonAtomically(filePath, { ...snapshot, users });
}

function migrateKnowledgeFile(dataRoot: string): void {
  const filePath = path.join(dataRoot, "knowledge-state.json");
  const snapshot = readJson(filePath);
  if (!snapshot) return;
  const removeLegacyScope = (entries: unknown): unknown =>
    Array.isArray(entries)
      ? entries.filter((entry) => !Array.isArray(entry) || typeof entry[0] !== "string" || !entry[0].startsWith(`${LEGACY_TENANT_ID}::`))
      : entries;
  writeJsonAtomically(filePath, {
    ...snapshot,
    docsByScope: removeLegacyScope(snapshot.docsByScope),
    queriesByScope: removeLegacyScope(snapshot.queriesByScope),
    auditByScope: removeLegacyScope(snapshot.auditByScope),
  });
}

function removeLegacyTenantDirectory(parentDirectory: string): boolean {
  const parent = path.resolve(parentDirectory);
  const target = path.resolve(parent, LEGACY_TENANT_ID);
  if (path.dirname(target) !== parent || path.basename(target) !== LEGACY_TENANT_ID) {
    throw new Error(`Refus de supprimer un chemin inattendu : ${target}`);
  }
  if (!fs.existsSync(target)) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

async function resetPostgresTenant(): Promise<number> {
  const pool = getPgPool();
  if (!pool) return 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS guardian_migrations (
        migration_id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const alreadyApplied = await client.query(
      "SELECT 1 FROM guardian_migrations WHERE migration_id = $1",
      [MIGRATION_ID]
    );
    if (alreadyApplied.rowCount) {
      await client.query("COMMIT");
      console.log(`[reset-demo] Migration PostgreSQL ${MIGRATION_ID} déjà appliquée.`);
      return 0;
    }

    const tables = await client.query<{ table_name: string }>(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenant_id'
        AND table_name = ANY($1::text[])
      ORDER BY table_name
    `, [TENANT_SCOPED_TABLES]);
    let deletedRows = 0;
    for (const { table_name: tableName } of tables.rows) {
      const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
      const result = await client.query(
        `DELETE FROM public.${quotedTable} WHERE tenant_id = $1`,
        [LEGACY_TENANT_ID]
      );
      deletedRows += result.rowCount ?? 0;
    }
    await client.query("INSERT INTO guardian_migrations (migration_id) VALUES ($1)", [MIGRATION_ID]);
    await client.query("COMMIT");
    return deletedRows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (process.env.RESET_LEGACY_DAKAR_DEMO !== "1") {
    console.log("[reset-demo] Rien à faire : RESET_LEGACY_DAKAR_DEMO n’est pas défini à 1.");
    return;
  }

  const dataRoot = path.join(getBackendRoot(), "data");
  fs.mkdirSync(dataRoot, { recursive: true });
  const diskMarker = path.join(dataRoot, `.${MIGRATION_ID}.done`);
  let deletedDatabaseRows = 0;

  if (isPgEnabled()) {
    deletedDatabaseRows = await resetPostgresTenant();
  } else {
    console.log("[reset-demo] PostgreSQL non configuré : nettoyage du stockage local uniquement.");
  }

  if (fs.existsSync(diskMarker)) {
    console.log(`[reset-demo] Nettoyage des fichiers ${MIGRATION_ID} déjà appliqué.`);
  } else {
    migrateJournalFile(dataRoot);
    migrateUsersFile(dataRoot);
    migrateKnowledgeFile(dataRoot);
    const removedDirectories = [
      path.join(dataRoot, "archive"),
      path.join(dataRoot, "quarantine"),
      path.join(dataRoot, "inbox"),
      path.join(dataRoot, "meal-projects"),
      ...(process.env.INBOX_DIR?.trim() ? [process.env.INBOX_DIR.trim()] : []),
    ].filter(removeLegacyTenantDirectory).length;
    fs.writeFileSync(diskMarker, `${MIGRATION_ID}\n`, { encoding: "utf8", flag: "wx" });
    console.log(`[reset-demo] Nettoyage local terminé (${removedDirectories} dossier(s) ciblé(s)).`);
  }

  console.log(
    `[reset-demo] Tenant legacy ${LEGACY_TENANT_ID} réinitialisé (${deletedDatabaseRows} ligne(s) PostgreSQL supprimée(s)).`
  );
}

main()
  .catch(async (error) => {
    console.error("[reset-demo] Échec du nettoyage legacy :", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
