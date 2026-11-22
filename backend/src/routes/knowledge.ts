import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { AuthUnauthorizedError } from "../auth";
import { journalRepo } from "../journal";
import { knowledgeEngine, type ClassificationLevel, type CryptographicCitation } from "../rag/engine";
import { TenantIsolationError } from "../tenant";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const IngestDocSchema = z.object({
  spaceId: z.string().optional(),
  title: z.string().min(2),
  fileName: z.string().min(1),
  content: z.string().min(10),
  department: z.string().optional(),
  classification: z.enum(["PUBLIC", "INTERNE", "RESTREINT", "CONFIDENTIEL"]).default("INTERNE"),
});

const RagQuerySchema = z.object({
  spaceId: z.string().optional(),
  question: z.string().min(2),
  clearanceFilter: z.enum(["ALL", "PUBLIC", "INTERNE", "RESTREINT", "CONFIDENTIEL"]).optional(),
});

const VerifyProofSchema = z.object({
  spaceId: z.string().optional(),
  chunkHash: z.string().min(10),
  queryHash: z.string().min(10),
  sealedAt: z.string().min(4),
  proofReceipt: z.string().min(10),
});

const ExportDocxSchema = z.object({
  spaceId: z.string().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  queryHash: z.string().min(1),
  merkleProofRoot: z.string().min(1),
  citations: z.array(z.any()).default([]),
});

const EnterpriseContactSchema = z.object({
  organization: z.string().min(2),
  contactName: z.string().min(2),
  email: z.string().email(),
  employeeCount: z.string().min(1),
  deploymentMode: z.enum(["SecNumCloud", "On-Premise", "Hybride"]).default("SecNumCloud"),
  message: z.string().min(5),
});

export async function handleKnowledgeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    // Public lead capture endpoint for showcase landing page
    if (url.pathname === "/api/contact/enterprise" && req.method === "POST") {
      const body = EnterpriseContactSchema.parse(await readJsonBody(req));
      const ticket = knowledgeEngine.registerEnterpriseLead(body);
      return sendJson(res, 201, {
        ticketId: ticket.id,
        status: "ENREGISTRE",
        message: "Votre demande de déploiement souverain a été enregistrée.",
        createdAt: ticket.createdAt,
      });
    }

    await journalRepo.ensureReady();

    if (url.pathname === "/api/knowledge/documents" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        documents: knowledgeEngine.listDocuments(ctx),
      });
    }

    if (url.pathname === "/api/knowledge/documents" && req.method === "POST") {
      const body = IngestDocSchema.parse(await readJsonBody(req));
      const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
      const doc = knowledgeEngine.ingestDocument(ctx, {
        title: body.title,
        fileName: body.fileName,
        content: body.content,
        department: body.department || user.department,
        classification: body.classification as ClassificationLevel,
        uploadedBy: user.fullName,
        actorEmail: user.email,
        actorRole: user.role,
      });
      return sendJson(res, 201, { document: doc });
    }

    if (url.pathname.startsWith("/api/knowledge/documents/") && req.method === "DELETE") {
      const docId = decodeURIComponent(
        url.pathname.replace("/api/knowledge/documents/", "").split("/")[0] || ""
      );
      const { user, ctx } = resolveHttpContext(req, url);
      const deleted = knowledgeEngine.deleteDocument(ctx, docId, user.email, user.role);
      if (!deleted) return sendJson(res, 404, { message: "Document introuvable." });
      return sendJson(res, 200, { deleted: true, id: docId });
    }

    if (url.pathname === "/api/knowledge/query" && req.method === "POST") {
      const body = RagQuerySchema.parse(await readJsonBody(req));
      const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
      const result = await knowledgeEngine.queryHybridRag(ctx, {
        question: body.question,
        clearanceFilter: body.clearanceFilter,
        actorEmail: user.email,
        actorRole: user.role,
      });
      return sendJson(res, 200, result);
    }

    if (url.pathname === "/api/knowledge/queries" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        queries: knowledgeEngine.listQueries(ctx),
      });
    }

    if (url.pathname === "/api/knowledge/verify-proof" && req.method === "POST") {
      const body = VerifyProofSchema.parse(await readJsonBody(req));
      const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
      const verification = knowledgeEngine.verifyCitationProof(ctx, {
        chunkHash: body.chunkHash,
        queryHash: body.queryHash,
        sealedAt: body.sealedAt,
        proofReceipt: body.proofReceipt,
        actorEmail: user.email,
        actorRole: user.role,
      });
      return sendJson(res, 200, verification);
    }

    if (url.pathname === "/api/knowledge/export-docx" && req.method === "POST") {
      const body = ExportDocxSchema.parse(await readJsonBody(req));
      const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
      const { buffer, fileName } = await knowledgeEngine.exportBriefingDocx(ctx, {
        question: body.question,
        answer: body.answer,
        queryHash: body.queryHash,
        merkleProofRoot: body.merkleProofRoot,
        citations: body.citations as CryptographicCitation[],
        actorEmail: user.email,
        actorRole: user.role,
      });
      res.writeHead(200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": buffer.length,
      });
      res.end(buffer);
      return;
    }

    if (url.pathname === "/api/knowledge/audit" && req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        audit: knowledgeEngine.listAudit(ctx),
        compliance: knowledgeEngine.getComplianceMetrics(ctx),
      });
    }

    return sendJson(res, 404, { message: "Route knowledge introuvable" });
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) return sendJson(res, 401, { message: err.message });
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    return sendJson(res, 400, {
      message: err instanceof Error ? err.message : "Erreur moteur de connaissance",
    });
  }
}
