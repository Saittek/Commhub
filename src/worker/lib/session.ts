import type { Context } from "hono";
import { getSessionToken, verifyToken, type TokenPayload } from "./auth";

export async function requireUser(c: Context<{ Bindings: Env }>): Promise<TokenPayload | Response> {
  const token = getSessionToken(c.req.raw);
  if (!token) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);
  if (!payload) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return payload;
}
