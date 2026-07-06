import type { Hono } from "hono";
import type { Context } from "hono";
import { hashPassword, verifyPassword } from "./lib/auth";
import { createServerBan, isUserBanned } from "./lib/bans";
import { listBlockedUsers, isEitherUserBlocked } from "./lib/blocks";
import { listAuditLog, writeAuditLog } from "./lib/audit-log";
import { sendPasswordResetEmail } from "./lib/email";
import {
  createResetToken,
  hashResetToken,
  isResetTokenExpired,
  resetTokenExpiresAt,
} from "./lib/password-reset";
import {
  ensurePrivacySettings,
  getPrivacySettings,
  updatePrivacySettings,
  type PrivacySettings,
} from "./lib/privacy";
import { memberHasPermission } from "./lib/user-permissions";
import { requireUser } from "./lib/session";
import {
  requireServerMember,
} from "./lib/server-access";
import { checkVerificationLevel } from "./lib/verification";
import { getVisibleOnlineServerMembers, touchServerPresence } from "./lib/presence";
import { ensureDefaultRoles } from "./lib/roles";
import {
  normalizeForgotPassword,
  normalizeResetPassword,
  validateForgotPassword,
  validateResetPassword,
} from "./lib/validation";
import { getUserRow } from "./lib/users";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function sendVerificationEmail(
  c: Context<{ Bindings: Env }>,
  userId: string,
  email: string,
): Promise<{ sent: boolean; devLink?: string }> {
  const token = createResetToken();
  const tokenHash = await hashResetToken(token);
  const tokenId = crypto.randomUUID();
  const expiresAt = resetTokenExpiresAt();

  await c.env.DB.prepare(
    "DELETE FROM email_verification_tokens WHERE user_id = ?",
  )
    .bind(userId)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(tokenId, userId, tokenHash, expiresAt)
    .run();

  const origin = new URL(c.req.url).origin;
  const verifyUrl = `${origin}/auth?verify=${encodeURIComponent(token)}`;

  const subject = "Verify your Commhub email";
  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2>Verify your email</h2>
      <p>Confirm your email address to unlock full access on servers with verification enabled.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 18px;background:#2dd4bf;color:#0a0a0f;text-decoration:none;border-radius:8px;font-weight:700">Verify email</a></p>
      <p style="word-break:break-all">${verifyUrl}</p>
    </div>
  `.trim();

  const apiKey = (c.env as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[commhub] Email verification link for ${email}: ${verifyUrl}`);
    return { sent: false, devLink: verifyUrl };
  }

  const from = (c.env as { EMAIL_FROM?: string }).EMAIL_FROM ?? "Commhub <noreply@commhub.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: email, subject, html }),
  });

  if (!response.ok) {
    throw new Error("Could not send verification email.");
  }

  return { sent: true };
}

export function registerSafetyRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/auth/forgot-password", async (c) => {
    const body = await c.req.json<{ email?: string }>();
    const input = normalizeForgotPassword({ email: body.email ?? "" });
    const validationError = validateForgotPassword(input);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const user = await c.env.DB.prepare(
      "SELECT id, email FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
    )
      .bind(input.email)
      .first<{ id: string; email: string }>();

    if (user) {
      const token = createResetToken();
      const tokenHash = await hashResetToken(token);
      await c.env.DB.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), user.id, tokenHash, resetTokenExpiresAt())
        .run();

      const origin = new URL(c.req.url).origin;
      const resetUrl = `${origin}/auth?reset=${encodeURIComponent(token)}`;
      const apiKey = (c.env as { RESEND_API_KEY?: string }).RESEND_API_KEY;
      const from = (c.env as { EMAIL_FROM?: string }).EMAIL_FROM ?? "Commhub <noreply@commhub.app>";
      await sendPasswordResetEmail({
        apiKey,
        from,
        to: user.email,
        resetUrl,
      });
    }

    return c.json({
      ok: true,
      message: "If that email exists, a reset link has been sent.",
    });
  });

  app.post("/api/auth/reset-password", async (c) => {
    const body = await c.req.json<{ token?: string; password?: string }>();
    const input = normalizeResetPassword({
      token: body.token ?? "",
      password: body.password ?? "",
    });
    const validationError = validateResetPassword(input);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const tokenHash = await hashResetToken(input.token);
    const row = await c.env.DB.prepare(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = ? LIMIT 1`,
    )
      .bind(tokenHash)
      .first<{
        id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>();

    if (!row || row.used_at || isResetTokenExpired(row.expires_at)) {
      return jsonError("Reset link is invalid or expired.", 400);
    }

    const { hash, salt } = await hashPassword(input.password);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
        .bind(hash, salt, row.user_id),
      c.env.DB.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?")
        .bind(row.id),
    ]);

    return c.json({ ok: true });
  });

  app.post("/api/auth/verify-email/send", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const row = await getUserRow(c.env.DB, user.sub);
    if (!row) {
      return jsonError("User not found.", 404);
    }

    if ((row.email_verified ?? 0) === 1) {
      return c.json({ ok: true, message: "Email is already verified." });
    }

    const result = await sendVerificationEmail(c, row.id, row.email);
    return c.json({
      ok: true,
      message: result.sent
        ? "Verification email sent."
        : "Verification link logged to the dev server console.",
      devLink: result.devLink,
    });
  });

  app.post("/api/auth/verify-email", async (c) => {
    const body = await c.req.json<{ token?: string }>();
    const token = (body.token ?? "").trim();
    if (!token) {
      return jsonError("Verification link is invalid.", 400);
    }

    const tokenHash = await hashResetToken(token);
    const row = await c.env.DB.prepare(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = ? LIMIT 1`,
    )
      .bind(tokenHash)
      .first<{
        id: string;
        user_id: string;
        expires_at: string;
        used_at: string | null;
      }>();

    if (!row || row.used_at || isResetTokenExpired(row.expires_at)) {
      return jsonError("Verification link is invalid or expired.", 400);
    }

    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id),
      c.env.DB.prepare(
        "UPDATE email_verification_tokens SET used_at = datetime('now') WHERE id = ?",
      ).bind(row.id),
    ]);

    return c.json({ ok: true });
  });

  app.get("/api/auth/privacy", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    await ensurePrivacySettings(c.env.DB, user.sub);
    const settings = await getPrivacySettings(c.env.DB, user.sub);
    const row = await getUserRow(c.env.DB, user.sub);

    return c.json({
      settings,
      emailVerified: (row?.email_verified ?? 0) === 1,
    });
  });

  app.patch("/api/auth/privacy", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const body = await c.req.json<Partial<{
      allowDmFrom: 0 | 1 | 2;
      allowFriendRequests: boolean;
      showActivityStatus: boolean;
      allowServerInvites: boolean;
      filterExplicitContent: boolean;
    }>>();

    const settings = await updatePrivacySettings(c.env.DB, user.sub, body as Partial<PrivacySettings>);
    return c.json({ settings });
  });

  app.get("/api/auth/blocks", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const blocks = await listBlockedUsers(c.env.DB, user.sub);
    return c.json({ blocks });
  });

  app.post("/api/auth/blocks/:userId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const blockedUserId = c.req.param("userId");
    if (blockedUserId === user.sub) {
      return jsonError("You cannot block yourself.", 400);
    }

    const target = await getUserRow(c.env.DB, blockedUserId);
    if (!target) {
      return jsonError("User not found.", 404);
    }

    await c.env.DB.prepare(
      `INSERT INTO user_blocks (id, blocker_user_id, blocked_user_id)
       VALUES (?, ?, ?)
       ON CONFLICT(blocker_user_id, blocked_user_id) DO NOTHING`,
    )
      .bind(crypto.randomUUID(), user.sub, blockedUserId)
      .run();

    return c.json({ ok: true });
  });

  app.delete("/api/auth/blocks/:userId", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    await c.env.DB.prepare(
      "DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?",
    )
      .bind(user.sub, c.req.param("userId"))
      .run();

    return c.json({ ok: true });
  });

  app.delete("/api/auth/account", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const body = await c.req.json<{ password?: string }>();
    const password = body.password ?? "";
    if (!password) {
      return jsonError("Password is required to delete your account.", 400);
    }

    const row = await c.env.DB.prepare(
      "SELECT password_hash, password_salt FROM users WHERE id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ password_hash: string; password_salt: string }>();

    if (!row || !(await verifyPassword(password, row.password_hash, row.password_salt))) {
      return jsonError("Incorrect password.", 403);
    }

    await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.sub).run();
    return c.json({ ok: true });
  });

  app.get("/api/servers/:serverId/audit-log", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) {
      return server;
    }

    const allowed = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "view_audit_log",
    );
    if (!allowed) {
      return jsonError("You do not have permission to view the audit log.", 403);
    }

    const events = await listAuditLog(c.env.DB, server.id);
    return c.json({
      events: events.map((event) => ({
        id: event.id,
        actionType: event.action_type,
        targetType: event.target_type,
        targetId: event.target_id,
        reason: event.reason,
        metadata: event.metadata ? JSON.parse(event.metadata) : null,
        createdAt: event.created_at,
        actorUsername: event.actor_username,
      })),
    });
  });

  app.post("/api/servers/:serverId/members/:userId/ban", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) {
      return server;
    }

    const targetUserId = c.req.param("userId");
    if (targetUserId === server.owner_id) {
      return jsonError("You cannot ban the server owner.", 400);
    }

    const allowed =
      server.owner_id === user.sub ||
      (await memberHasPermission(
        c.env.DB,
        server.id,
        user.sub,
        server.owner_id,
        "ban_members",
      ));
    if (!allowed) {
      return jsonError("You do not have permission to ban members.", 403);
    }

    const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: "" }));
    const target = await getUserRow(c.env.DB, targetUserId);
    if (!target) {
      return jsonError("Member not found.", 404);
    }

    await createServerBan(c.env.DB, {
      serverId: server.id,
      userId: targetUserId,
      username: target.username,
      reason: body.reason ?? "",
      bannedBy: user.sub,
    });

    await writeAuditLog(c.env.DB, {
      serverId: server.id,
      actorUserId: user.sub,
      actionType: "member_ban",
      targetType: "user",
      targetId: targetUserId,
      reason: body.reason ?? null,
    });

    return c.json({ ok: true });
  });
}

export async function enforceJoinSafety(
  c: Context<{ Bindings: Env }>,
  serverId: string,
  userId: string,
): Promise<Response | null> {
  if (await isUserBanned(c.env.DB, serverId, userId)) {
    return jsonError("You are banned from this server.", 403);
  }
  return null;
}

export async function mapOnlineMembersForServer(
  c: Context<{ Bindings: Env }>,
  server: { id: string; owner_id: string },
) {
  await ensureDefaultRoles(c.env.DB, server.id, server.owner_id);
  const members = await getVisibleOnlineServerMembers(c.env.DB, server.id, server.owner_id);
  return {
    members: members.map((member) => ({
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      avatarUrl: member.avatarUrl,
      isOwner: member.isOwner,
      displayRole: member.displayRole,
    })),
    onlineCount: members.length,
  };
}

export { touchServerPresence, checkVerificationLevel, writeAuditLog, isEitherUserBlocked };
