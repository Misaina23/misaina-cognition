import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  authenticateRequest,
  AuthUnauthorizedError,
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  signSessionJwt,
  verifyUserCredentials,
} from "../auth";
import { journalRepo } from "../journal";
import { listAuthorizedSpaces } from "../tenant";
import { readJsonBody, sendJson } from "./sources";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function handleAuthRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  try {
    await journalRepo.ensureReady();

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
    if (err instanceof AuthUnauthorizedError) {
      return sendJson(res, 401, { message: err.message });
    }
    return sendJson(res, 400, {
      message: err instanceof Error ? err.message : "Erreur authentification",
    });
  }
}
