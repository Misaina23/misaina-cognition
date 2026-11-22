import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { journalRepo, resolveValidationItem, rollbackAgentAction } from "../journal";
import { TenantIsolationError } from "../tenant";
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
    if (url.pathname.startsWith("/api/validations")) {
      if (req.method === "GET") {
        const { ctx } = resolveHttpContext(req, url);
        return sendJson(res, 200, {
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          validations: journalRepo.listValidations(ctx),
        });
      }
      if (req.method === "POST") {
        const body = ValidationDecisionSchema.parse(await readJsonBody(req));
        const { ctx } = resolveHttpContext(req, url, body.spaceId);
        return sendJson(
          res,
          200,
          resolveValidationItem(ctx, body.validationId, body.decision)
        );
      }
    }

    if (req.method === "GET") {
      const { ctx } = resolveHttpContext(req, url);
      const runId = url.searchParams.get("runId") || undefined;
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        actions: journalRepo.listAgentActions(ctx, runId),
      });
    }

    if (req.method === "POST") {
      const body = RollbackSchema.parse(await readJsonBody(req));
      const { ctx } = resolveHttpContext(req, url, body.spaceId);
      const revertedAction = rollbackAgentAction(ctx, body.actionId);
      return sendJson(res, 200, {
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        revertedAction,
      });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    if (err instanceof TenantIsolationError) return sendJson(res, 403, { message: err.message });
    return sendJson(res, 400, { message: err instanceof Error ? err.message : "Erreur actions" });
  }
}
