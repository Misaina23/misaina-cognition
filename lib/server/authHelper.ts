import { NextRequest } from "next/server";
import { mockDb, UserRecord } from "./mockDb";

export function getAuthUser(req: NextRequest): UserRecord | null {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;

  const token = parts[1];
  // Format: mock-token-{userId} or jwt payload or just an id
  if (token.startsWith("mock-token-")) {
    const id = token.replace("mock-token-", "");
    return mockDb.findUserById(id) || null;
  }

  // Fallback: search if token equals user ID or first user
  const userById = mockDb.findUserById(token);
  if (userById) return userById;

  // Fallback to default user if token exists
  return mockDb.users[0] || null;
}
