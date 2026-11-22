import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { journalRepo, resolveValidationItem, rollbackAgentAction } from "../journal";
import { formatApiError } from "../security";
import { requirePermission } from "../tenant";
import { readJsonBody, resolveHttpContext, sendJson } from "./sources";

const RollbackSchema = z.object({
  spaceId: z.string().optional(),
  actionId: z.string().min(1),
});

const ValidationDecisionSchema = z.object({
  spaceId: z.string().optional(),
  validationId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
});

export async function handleActionsRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();
    if (url.pathname.startsWith("/api/validations")) {
      if (req.method === "GET") {
        const { user, ctx } = resolveHttpContext(req, url);
        requirePermission(user, "meal:read");
        return sendJson(res, 200, {
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          validations: journalRepo.listValidations(ctx),
        });
      }
      if (req.method === "POST") {
        const body = ValidationDecisionSchema.parse(await readJsonBody(req));
        const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
        requirePermission(user, "meal:validate");
        const resolved = resolveValidationItem(ctx, body.validationId, body.decision);
        await journalRepo.flushPg();
        return sendJson(res, 200, resolved);
      }
    }

    if (req.method === "GET") {
      const { user, ctx } = resolveHttpContext(req, url);
      requirePermission(user, "meal:read");
      const runId = url.searchParams.get("runId") || undefined;
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        actions: journalRepo.listAgentActions(ctx, runId),
      });
    }

    if (req.method === "POST") {
      const body = RollbackSchema.parse(await readJsonBody(req));
      const { user, ctx } = resolveHttpContext(req, url, body.spaceId);
      requirePermission(user, "meal:rollback");
      const revertedAction = rollbackAgentAction(ctx, body.actionId);
      await journalRepo.flushPg();
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        revertedAction,
      });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    const { status, message } = formatApiError(err, "Erreur actions");
    return sendJson(res, status, { message });
  }
}
