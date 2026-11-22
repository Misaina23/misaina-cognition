import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { runGuardianAgent } from "../agent/agent";
import { CommCareConnector } from "../connectors/commcare";
import { CsvConnector } from "../connectors/csv";
import { ExcelConnector } from "../connectors/excel";
import { GenericConnector } from "../connectors/generic";
import { journalRepo, saveRawUploadToArchive } from "../journal";
import {
  createUserSpace,
  getPrincipalByIdOrHeader,
  listAuthorizedSpaces,
  resolveContextForUser,
  TenantIsolationError,
} from "../tenant";

const RegisterSourceSchema = z.object({
  spaceId: z.string().optional(),
  name: z.string().min(2),
  type: z.enum(["csv", "excel", "commcare", "generic"]),
  format: z.enum(["json", "kobo", "odk"]).optional(),
  endpointUrl: z.string().url().optional(),
  authTokenEnvName: z.string().optional(),
  columnMapping: z.record(z.string(), z.string()).optional(),
});

const IngestPayloadSchema = z.object({
  spaceId: z.string().optional(),
  sourceId: z.string().optional(),
  fileName: z.string().optional(),
  csvText: z.string().optional(),
  fileBase64: z.string().optional(),
  rawItems: z.array(z.record(z.string(), z.unknown())).optional(),
  columnMapping: z.record(z.string(), z.string()).optional(),
});

export function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function resolveHttpContext(req: IncomingMessage, url: URL, explicitSpaceId?: string) {
  const userHeader = req.headers["x-user-id"];
  const userId = Array.isArray(userHeader) ? userHeader[0] : userHeader;
  const user = getPrincipalByIdOrHeader(userId);
  const spaceId = explicitSpaceId ?? url.searchParams.get("spaceId");
  return { user, ctx: resolveContextForUser(user, spaceId) };
}

export async function handleSourcesRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();
    if (url.pathname === "/api/spaces" && req.method === "GET") {
      const userHeader = req.headers["x-user-id"];
      const user = getPrincipalByIdOrHeader(Array.isArray(userHeader) ? userHeader[0] : userHeader);
      return sendJson(res, 200, { spaces: listAuthorizedSpaces(user) });
    }

    if (url.pathname === "/api/spaces" && req.method === "POST") {
      const userHeader = req.headers["x-user-id"];
      const user = getPrincipalByIdOrHeader(Array.isArray(userHeader) ? userHeader[0] : userHeader);
      const body = (await readJsonBody(req)) as { name?: string; description?: string };
      const ctx = resolveContextForUser(user);
      const space = createUserSpace(ctx.tenantId, user.id, body.name || "Nouvel espace", body.description);
      journalRepo.syncSpacePg(space);
      await journalRepo.flushPg();
      return sendJson(res, 201, { space });
    }

    if (req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        sources: journalRepo.listSources(ctx),
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/ingest")) {
      const body = IngestPayloadSchema.parse(await readJsonBody(req));
      const { ctx } = resolveHttpContext(req, url, body.spaceId);

      const isExcel = body.fileName?.toLowerCase().endsWith(".xlsx");
      const source =
        (body.sourceId ? journalRepo.getSource(ctx, body.sourceId) : null) ||
        journalRepo.ensureSourceForType(ctx, isExcel ? "excel" : "csv", "Source Upload");

      let result;
      if (body.fileBase64 || body.csvText) {
        const buffer = body.fileBase64
          ? Buffer.from(body.fileBase64, "base64")
          : Buffer.from(body.csvText!, "utf8");
        saveRawUploadToArchive(ctx, body.fileName || "upload.csv", buffer);
        const connector = isExcel ? new ExcelConnector() : new CsvConnector();
        result = await connector.ingest(
          {
            source,
            fileBuffer: buffer,
            fileName: body.fileName,
            columnMapping: body.columnMapping,
          },
          ctx
        );
      } else if (body.rawItems || source.type === "commcare" || (source.type === "generic" && source.endpointUrl)) {
        const connector =
          source.type === "commcare"
            ? new CommCareConnector()
            : source.type === "generic"
              ? new GenericConnector()
              : new CsvConnector();
        result = await connector.ingest(
          { source, rawItems: body.rawItems, columnMapping: body.columnMapping },
          ctx
        );
      } else {
        return sendJson(res, 400, { message: "csvText, fileBase64, rawItems ou endpointUrl requis." });
      }

      const agentRes = await runGuardianAgent(ctx, {
        sourceId: source.id,
        trigger: "upload",
      });
      await journalRepo.flushPg();

      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        ingest: {
          insertedCount: result.insertedCount,
          skippedIdempotentCount: result.skippedIdempotentCount,
        },
        run: agentRes.run,
      });
    }

    if (req.method === "POST") {
      const body = RegisterSourceSchema.parse(await readJsonBody(req));
      const { ctx } = resolveHttpContext(req, url, body.spaceId);
      const source = journalRepo.upsertSource(ctx, {
        id: `src-${ctx.spaceId}-${Date.now()}`,
        name: body.name,
        type: body.type,
        format: body.format,
        endpointUrl: body.endpointUrl,
        authTokenEnvName: body.authTokenEnvName,
        columnMapping: body.columnMapping,
        status: "ACTIVE",
      });
      await journalRepo.flushPg();
      return sendJson(res, 201, { source });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    return sendJson(res, 400, {
      message: err instanceof Error ? err.message : "Erreur sources",
    });
  }
}
