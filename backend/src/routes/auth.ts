import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  authenticateRequest,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  registerPendingAccount,
  signSessionJwt,
  verifyUserCredentials,
} from "../auth";
import { journalRepo } from "../journal";
import { formatApiError } from "../security";
import { listAuthorizedSpaces } from "../tenant";
import { readJsonBody, sendJson } from "./sources";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const RegisterSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  department: z.string().min(2),
  requestedRole: z.enum(["COORDINATEUR", "ANALYSTE", "LECTEUR"]).optional(),
});

export async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();

    if (url.pathname === "/api/auth/register" && req.method === "POST") {
      const body = RegisterSchema.parse(await readJsonBody(req));
      const created = registerPendingAccount(body);
      return sendJson(res, 201, {
        registered: true,
        status: created.status,
        message:
          "Demande de création de compte enregistrée (en attente de validation par le Super Admin SAINA ou un administrateur).",
        user: {
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          department: created.department,
          role: created.role,
          status: created.status,
          createdAt: created.createdAt,
        },
      });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = LoginSchema.parse(await readJsonBody(req));
      const user = verifyUserCredentials(body.email, body.password);
      if (!user) {
        return sendJson(res, 401, { message: "Identifiants invalides." });
      }
      const token = signSessionJwt(user);
      res.setHeader("Set-Cookie", buildSessionCookieHeader(token, undefined, req));
      return sendJson(res, 200, {
        user,
        token,
        spaces: listAuthorizedSpaces(user),
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie", buildClearSessionCookieHeader(req));
      return sendJson(res, 200, { loggedOut: true });
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = authenticateRequest(req);
      return sendJson(res, 200, {
        user,
        spaces: listAuthorizedSpaces(user),
      });
    }

    return sendJson(res, 405, { message: "Méthode non supportée" });
  } catch (err) {
    const { status, message } = formatApiError(err, "Erreur authentification");
    return sendJson(res, status, { message });
  }
}
