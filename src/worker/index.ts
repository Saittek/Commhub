import { Hono } from "hono";
import type { Context } from "hono";
import type { TokenPayload } from "./lib/auth";
import {
  clearSessionCookie,
  hashPassword,
  isSecureRequest,
  setSessionCookie,
  signToken,
  verifyPassword,
} from "./lib/auth";
import {
  normalizeLogin,
  normalizeSignup,
  normalizeChangePassword,
  normalizeUpdateEmail,
  normalizeUpdateProfile,
  validateChangePassword,
  validateLogin,
  validateSignup,
  validateUpdateEmail,
  validateUpdateProfile,
} from "./lib/validation";
import {
  ALLOWED_AVATAR_TYPES,
  avatarStorageKey,
  extensionForAvatarType,
  getUserRow,
  MAX_AVATAR_BYTES,
  sessionUserFromPayload,
} from "./lib/users";
import { requireUser } from "./lib/session";
import {
  generateUniqueInviteCode,
  normalizeCreateServer,
  normalizeJoinServer,
  validateCreateServer,
  validateJoinServer,
  validateUpdateServer,
  type UpdateServerInput,
} from "./lib/servers";
import {
  listMyServers,
  listPublicServers,
  mapServer,
  requireServerMember,
  requireServerOwner,
  requireManageServer,
  serverIconStorageKey,
  serverIconUrl,
} from "./lib/server-access";
import {
  getServerChannel,
  isVoiceLikeType,
  listServerChannels,
  mapChannel,
  normalizeChannelName,
  resolveVoiceUserLimit,
  validateCreateChannel,
  validateUpdateChannel,
  type ChannelType,
  type UpdateChannelInput,
} from "./lib/channels";
import {
  ensureDefaultRoles,
  mapRole,
  sanitizePermissions,
  userCanManageRoles,
  validateCreateRole,
  validateUpdateRole,
  type CreateRoleInput,
  type RoleRow,
  type UpdateRoleInput,
} from "./lib/roles";
import { VoiceRoom } from "./voice-room";
import { TextRoom } from "./text-room";
import {
  handleAddReaction,
  handleCreateMessage,
  handleDeleteMessage,
  handleGetAttachment,
  handleGetMyPermissions,
  handleGetThreadCounts,
  handleListMessages,
  handleListPins,
  handleMarkRead,
  handlePinMessage,
  handleRemoveReaction,
  handleTextWebSocket,
  handleUnpinMessage,
  handleUpdateMessage,
  handleUploadAttachment,
} from "./message-routes";
import { memberHasPermission } from "./lib/user-permissions";
import { getAllRankedServerMembers, touchServerPresence } from "./lib/presence";
import {
  registerSafetyRoutes,
  enforceJoinSafety,
  mapOnlineMembersForServer,
  writeAuditLog,
  checkVerificationLevel,
} from "./safety-routes";
import { registerDiscordRoutes } from "./discord-routes";
import { registerDiscordExtraRoutes } from "./discord-routes-extra";
import { registerDiscordCompletionRoutes } from "./discord-completion-routes";
import { registerBotRoutes } from "./bot-routes";
import { registerOAuthRoutes } from "./oauth-routes";
import { registerPlatformRoutes } from "./platform-routes";
import { registerForumRoutes } from "./forum-routes";
import { registerCallsRoutes } from "./calls-routes";
import { isMemberTimedOut } from "./lib/discord-features";
import { ensurePrivacySettings } from "./lib/privacy";
import { buildUserProfile } from "./lib/user-profile";

export { VoiceRoom, TextRoom };

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.header("Permissions-Policy", "camera=(self), microphone=(self), display-capture=(self)");
});

function jsonWithCookie<T>(data: T, cookie: string, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookie,
    },
  });
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function workerErrorMessage(err: unknown): { message: string; status: number } {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("no such table") || message.includes("no such column")) {
    return {
      message:
        "Database schema is out of date. Stop the dev server, then run: npx wrangler d1 migrations apply commhub-db --local && npm run dev:clean",
      status: 500,
    };
  }

  if (message.includes("SQLITE_BUSY") || message.includes("database is locked")) {
    return {
      message: "Local database is busy. Stop other dev servers, then run: npm run dev:clean",
      status: 503,
    };
  }

  return {
    message: "Internal server error.",
    status: 500,
  };
}

app.onError((err, _c) => {
  console.error("[worker]", err);
  const { message, status } = workerErrorMessage(err);
  return jsonError(message, status);
});

app.post("/api/auth/signup", async (c) => {
  try {
    if (!c.env.JWT_SECRET) {
      return jsonError("Server is missing JWT_SECRET. Copy .dev.vars.example to .dev.vars for local dev.", 503);
    }

    const body = await c.req.json<{
      username?: string;
      email?: string;
      password?: string;
    }>();

    const input = normalizeSignup({
      username: body.username ?? "",
      email: body.email ?? "",
      password: body.password ?? "",
    });

    const validationError = validateSignup(input);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const existing = await c.env.DB.prepare(
      "SELECT id FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1",
    )
      .bind(input.username, input.email)
      .first<{ id: string }>();

    if (existing) {
      return jsonError("Username or email is already taken.", 409);
    }

    const { hash, salt } = await hashPassword(input.password);
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      "INSERT INTO users (id, username, email, password_hash, password_salt, display_name, email_verified) VALUES (?, ?, ?, ?, ?, ?, 0)",
    )
      .bind(id, input.username, input.email, hash, salt, input.username)
      .run();

    await ensurePrivacySettings(c.env.DB, id);

    const token = await signToken(
      {
        sub: id,
        username: input.username,
        email: input.email,
        displayName: input.username,
      },
      c.env.JWT_SECRET,
    );

    const cookie = setSessionCookie(token, isSecureRequest(c.req.raw));
    return jsonWithCookie(
      {
        user: {
          id,
          username: input.username,
          email: input.email,
          displayName: input.username,
          avatarUrl: null,
          emailVerified: false,
        },
      },
      cookie,
      201,
    );
  } catch (err) {
    console.error("signup failed:", err);
    const message =
      err instanceof Error && err.message.includes("no such table")
        ? "Database not initialized. Run: npx wrangler d1 migrations apply commhub-db --local"
        : "Could not create account. Restart the dev server and try again.";
    return jsonError(message, 500);
  }
});

app.post("/api/auth/login", async (c) => {
  try {
    if (!c.env.JWT_SECRET) {
      return jsonError("Server is missing JWT_SECRET. Copy .dev.vars.example to .dev.vars for local dev.", 503);
    }

    const body = await c.req.json<{
      usernameOrEmail?: string;
      password?: string;
    }>();

    const input = normalizeLogin({
      usernameOrEmail: body.usernameOrEmail ?? "",
      password: body.password ?? "",
    });

    const validationError = validateLogin(input);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const lookup = input.usernameOrEmail.toLowerCase();
    const user = await c.env.DB.prepare(
      "SELECT id, username, email, display_name, password_hash, password_salt FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE LIMIT 1",
    )
      .bind(lookup, lookup)
      .first<{
        id: string;
        username: string;
        email: string;
        display_name: string;
        password_hash: string;
        password_salt: string;
      }>();

    if (!user) {
      return jsonError("Invalid credentials.", 401);
    }

    const valid = await verifyPassword(input.password, user.password_hash, user.password_salt);
    if (!valid) {
      return jsonError("Invalid credentials.", 401);
    }

    const row = await getUserRow(c.env.DB, user.id);
    if (!row) {
      return jsonError("User not found.", 404);
    }

    const token = await signToken(
      {
        sub: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      c.env.JWT_SECRET,
    );

    const cookie = setSessionCookie(token, isSecureRequest(c.req.raw));
    return jsonWithCookie(
      {
        user: sessionUserFromPayload(
          {
            sub: user.id,
            username: user.username,
            email: user.email,
            displayName: user.display_name,
          },
          row,
        ),
      },
      cookie,
    );
  } catch (err) {
    console.error("login failed:", err);
    const message =
      err instanceof Error && err.message.includes("no such table")
        ? "Database not initialized. Run: npx wrangler d1 migrations apply commhub-db --local"
        : "Could not log in. Restart the dev server and try again.";
    return jsonError(message, 500);
  }
});

app.get("/api/auth/me", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const row = await getUserRow(c.env.DB, user.sub);
  if (!row) {
    return jsonError("User not found.", 404);
  }

  return c.json({ user: sessionUserFromPayload(user, row) });
});

app.get("/api/users/:userId/profile", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const targetUserId = c.req.param("userId");
  const serverId = c.req.query("serverId") ?? null;

  if (serverId) {
    const server = await requireServerMember(c, user, serverId);
    if (server instanceof Response) {
      return server;
    }
  }

  const profile = await buildUserProfile(c.env.DB, targetUserId, {
    viewerId: user.sub,
    serverId,
  });

  if (!profile) {
    return jsonError("User not found.", 404);
  }

  return c.json({ profile });
});

app.patch("/api/auth/profile", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const body = await c.req.json<{ email?: string; displayName?: string }>();

  if (body.email === undefined && body.displayName === undefined) {
    return jsonError("Provide email and/or displayName to update.", 400);
  }

  if (body.email !== undefined) {
    const emailInput = normalizeUpdateEmail({ email: body.email });
    const emailError = validateUpdateEmail(emailInput);
    if (emailError) {
      return jsonError(emailError, 400);
    }

    const existing = await c.env.DB.prepare(
      "SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id != ? LIMIT 1",
    )
      .bind(emailInput.email, user.sub)
      .first<{ id: string }>();

    if (existing) {
      return jsonError("That email is already in use.", 409);
    }

    await c.env.DB.prepare("UPDATE users SET email = ?, email_verified = 0 WHERE id = ?")
      .bind(emailInput.email, user.sub)
      .run();
  }

  if (body.displayName !== undefined) {
    const profileInput = normalizeUpdateProfile({ displayName: body.displayName });
    const profileError = validateUpdateProfile(profileInput);
    if (profileError) {
      return jsonError(profileError, 400);
    }

    await c.env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?")
      .bind(profileInput.displayName, user.sub)
      .run();
  }

  const row = await getUserRow(c.env.DB, user.sub);
  if (!row) {
    return jsonError("User not found.", 404);
  }

  const token = await signToken(
    {
      sub: user.sub,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
    },
    c.env.JWT_SECRET,
  );

  const cookie = setSessionCookie(token, isSecureRequest(c.req.raw));
  return jsonWithCookie(
    {
      user: sessionUserFromPayload(
        {
          sub: user.sub,
          username: row.username,
          email: row.email,
          displayName: row.display_name,
        },
        row,
      ),
    },
    cookie,
  );
});

app.post("/api/auth/password", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>();
  const input = normalizeChangePassword({
    currentPassword: body.currentPassword ?? "",
    newPassword: body.newPassword ?? "",
  });
  const validationError = validateChangePassword(input);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const account = await c.env.DB.prepare(
    "SELECT password_hash, password_salt FROM users WHERE id = ? LIMIT 1",
  )
    .bind(user.sub)
    .first<{ password_hash: string; password_salt: string }>();

  if (!account) {
    return jsonError("User not found.", 404);
  }

  const valid = await verifyPassword(
    input.currentPassword,
    account.password_hash,
    account.password_salt,
  );
  if (!valid) {
    return jsonError("Current password is incorrect.", 401);
  }

  const { hash, salt } = await hashPassword(input.newPassword);
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
    .bind(hash, salt, user.sub)
    .run();

  return c.json({ ok: true });
});

app.post("/api/auth/avatar", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("Avatar uploads are unavailable.", 503);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("No image provided.", 400);
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return jsonError("Avatar must be 1 MB or smaller.", 400);
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_AVATAR_TYPES.has(contentType)) {
    return jsonError("Avatar must be a PNG, JPEG, or WebP image.", 400);
  }

  const extension = extensionForAvatarType(contentType);
  if (!extension) {
    return jsonError("Avatar must be a PNG, JPEG, or WebP image.", 400);
  }

  const row = await getUserRow(c.env.DB, user.sub);
  if (!row) {
    return jsonError("User not found.", 404);
  }

  const storageKey = avatarStorageKey(user.sub, extension);

  if (row.avatar_url && row.avatar_url !== storageKey) {
    await c.env.ATTACHMENTS.delete(row.avatar_url);
  }

  await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
    httpMetadata: { contentType },
  });

  await c.env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?")
    .bind(storageKey, user.sub)
    .run();

  const updated = await getUserRow(c.env.DB, user.sub);
  if (!updated) {
    return jsonError("User not found.", 404);
  }

  return c.json({ user: sessionUserFromPayload(user, updated) });
});

app.get("/api/auth/avatars/:userId", async (c) => {
  const session = await requireUser(c);
  if (session instanceof Response) {
    return session;
  }

  const userId = c.req.param("userId");
  const row = await getUserRow(c.env.DB, userId);
  if (!row?.avatar_url) {
    return jsonError("Avatar not found.", 404);
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("File storage is unavailable.", 503);
  }

  const object = await c.env.ATTACHMENTS.get(row.avatar_url);
  if (!object) {
    return jsonError("Avatar file not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-cache");

  return new Response(object.body, { headers });
});

app.post("/api/auth/logout", async (c) => {
  const cookie = clearSessionCookie(isSecureRequest(c.req.raw));
  return jsonWithCookie({ ok: true }, cookie);
});

app.get("/api/servers/mine", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const rows = await listMyServers(c.env.DB, user.sub);
  return c.json({
    servers: rows.map((server) => ({
      id: server.id,
      name: server.name,
      inviteCode: server.invite_code,
      ownerId: server.owner_id,
      createdAt: server.created_at,
      iconUrl: serverIconUrl(server.id, server.icon_url),
      uiTextScale: server.ui_text_scale ?? 100,
    })),
  });
});

app.get("/api/servers/public", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const rows = await listPublicServers(c.env.DB, user.sub);
  return c.json({
    servers: rows.map((server) => ({
      id: server.id,
      name: server.name,
      description: server.description,
      iconUrl: serverIconUrl(server.id, server.icon_url),
      memberCount: server.member_count,
    })),
  });
});

app.post("/api/servers", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const body = await c.req.json<{ name?: string }>();
  const input = normalizeCreateServer({ name: body.name ?? "" });
  const validationError = validateCreateServer(input);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const serverId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const inviteCode = await generateUniqueInviteCode(c.env.DB);

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO servers (id, name, invite_code, owner_id) VALUES (?, ?, ?, ?)",
    ).bind(serverId, input.name, inviteCode, user.sub),
    c.env.DB.prepare(
      "INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)",
    ).bind(memberId, serverId, user.sub),
  ]);

  await ensureDefaultRoles(c.env.DB, serverId, user.sub);

  const generalChannelId = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, 'general', 'text')",
    ).bind(generalChannelId, serverId),
  ]);

  return c.json(
    {
      server: {
        id: serverId,
        name: input.name,
        inviteCode,
        ownerId: user.sub,
        iconUrl: null,
      },
    },
    201,
  );
});

app.post("/api/servers/join", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const body = await c.req.json<{ inviteCode?: string; serverId?: string }>();
  const input = normalizeJoinServer({
    inviteCode: body.inviteCode,
    serverId: body.serverId,
  });
  const validationError = validateJoinServer(input);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  let server: {
    id: string;
    name: string;
    invite_code: string;
    owner_id: string;
    invites_paused: number;
  } | null = null;

  if (input.serverId) {
    try {
      server = await c.env.DB.prepare(
        `SELECT id, name, invite_code, owner_id, invites_paused
         FROM servers WHERE id = ? AND is_public = 1 LIMIT 1`,
      )
        .bind(input.serverId)
        .first();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("no such column") || !message.includes("is_public")) {
        throw error;
      }
    }

    if (!server) {
      return jsonError("Server not found or is not listed publicly.", 404);
    }
  } else {
    const code = input.inviteCode ?? "";
    server = await c.env.DB.prepare(
      `SELECT id, name, invite_code, owner_id, invites_paused
       FROM servers WHERE invite_code = ? COLLATE NOCASE LIMIT 1`,
    )
      .bind(code)
      .first();

    if (!server) {
      server = await c.env.DB.prepare(
        `SELECT id, name, invite_code, owner_id, invites_paused
         FROM servers WHERE vanity_url = ? COLLATE NOCASE LIMIT 1`,
      )
        .bind(code.toLowerCase())
        .first();
    }

    if (!server) {
      const customInvite = await c.env.DB.prepare(
        `SELECT si.server_id, si.max_uses, si.uses, si.expires_at,
                s.id, s.name, s.invite_code, s.owner_id, s.invites_paused
         FROM server_invites si
         INNER JOIN servers s ON s.id = si.server_id
         WHERE si.code = ? COLLATE NOCASE LIMIT 1`,
      )
        .bind(code)
        .first<{
          server_id: string;
          max_uses: number | null;
          uses: number;
          expires_at: string | null;
          id: string;
          name: string;
          invite_code: string;
          owner_id: string;
          invites_paused: number;
        }>();

      if (customInvite) {
        if (customInvite.expires_at && new Date(customInvite.expires_at) < new Date()) {
          return jsonError("This invite has expired.", 410);
        }
        if (customInvite.max_uses !== null && customInvite.uses >= customInvite.max_uses) {
          return jsonError("This invite has reached its maximum uses.", 410);
        }
        server = {
          id: customInvite.id,
          name: customInvite.name,
          invite_code: customInvite.invite_code,
          owner_id: customInvite.owner_id,
          invites_paused: customInvite.invites_paused,
        };
        await c.env.DB.prepare("UPDATE server_invites SET uses = uses + 1 WHERE server_id = ? AND code = ? COLLATE NOCASE")
          .bind(customInvite.server_id, code)
          .run();
      }
    }
  }

  if (!server) {
    return jsonError("Invalid invite code.", 404);
  }

  if (server.invites_paused === 1) {
    return jsonError("Invites are paused for this server.", 403);
  }

  const banError = await enforceJoinSafety(c, server.id, user.sub);
  if (banError) {
    return banError;
  }

  const existingMember = await c.env.DB.prepare(
    "SELECT id FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  )
    .bind(server.id, user.sub)
    .first<{ id: string }>();

  if (existingMember) {
    return c.json({
      server: {
        id: server.id,
        name: server.name,
        inviteCode: server.invite_code,
        ownerId: server.owner_id,
      },
    });
  }

  const memberId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO server_members (id, server_id, user_id) VALUES (?, ?, ?)",
  )
    .bind(memberId, server.id, user.sub)
    .run();

  return c.json({
    server: {
      id: server.id,
      name: server.name,
      inviteCode: server.invite_code,
      ownerId: server.owner_id,
    },
  });
});

app.get("/api/servers/:serverId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const canViewInvite = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "create_invite",
  );
  const mapped = mapServer(server);
  if (!canViewInvite && server.owner_id !== user.sub) {
    return c.json({ server: { ...mapped, inviteCode: "" } });
  }

  return c.json({ server: mapped });
});

app.patch("/api/servers/:serverId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageServer(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const body = await c.req.json<UpdateServerInput>();
  const validationError = validateUpdateServer(body);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    values.push(body.name.trim());
  }
  if (body.description !== undefined) {
    updates.push("description = ?");
    values.push(body.description.trim());
  }
  if (body.region !== undefined) {
    updates.push("region = ?");
    values.push(body.region);
  }
  if (body.invitesPaused !== undefined) {
    updates.push("invites_paused = ?");
    values.push(body.invitesPaused ? 1 : 0);
  }
  if (body.verificationLevel !== undefined) {
    updates.push("verification_level = ?");
    values.push(body.verificationLevel);
  }
  if (body.defaultNotifications !== undefined) {
    updates.push("default_notifications = ?");
    values.push(body.defaultNotifications);
  }
  if (body.explicitContentFilter !== undefined) {
    updates.push("explicit_content_filter = ?");
    values.push(body.explicitContentFilter ? 1 : 0);
  }
  if (body.afkTimeoutMinutes !== undefined) {
    updates.push("afk_timeout_minutes = ?");
    values.push(body.afkTimeoutMinutes);
  }
  if (body.afkChannelId !== undefined) {
    if (body.afkChannelId) {
      const afkChannel = await getServerChannel(c.env.DB, server.id, body.afkChannelId);
      if (!afkChannel || !isVoiceLikeType(afkChannel.type)) {
        return jsonError("AFK channel must be a voice or stage channel.", 400);
      }
    }
    updates.push("afk_channel_id = ?");
    values.push(body.afkChannelId ?? "");
  }
  if (body.vanityUrl !== undefined) {
    const vanity = body.vanityUrl?.trim().toLowerCase() || null;
    if (vanity) {
      const taken = await c.env.DB.prepare(
        "SELECT id FROM servers WHERE vanity_url = ? COLLATE NOCASE AND id != ? LIMIT 1",
      )
        .bind(vanity, server.id)
        .first();
      if (taken) {
        return jsonError("That vanity URL is already taken.", 409);
      }
    }
    updates.push("vanity_url = ?");
    values.push(vanity ?? "");
  }
  if (body.uiTextScale !== undefined) {
    updates.push("ui_text_scale = ?");
    values.push(body.uiTextScale);
  }
  if (body.isPublic !== undefined) {
    updates.push("is_public = ?");
    values.push(body.isPublic ? 1 : 0);
  }

  if (updates.length === 0) {
    return jsonError("No settings to update.", 400);
  }

  values.push(server.id);
  await c.env.DB.prepare(`UPDATE servers SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await requireServerMember(c, user, server.id);
  if (updated instanceof Response) {
    return updated;
  }

  return c.json({ server: mapServer(updated) });
});

app.post("/api/servers/:serverId/icon", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerOwner(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("Server icon uploads are unavailable.", 503);
  }

  const formData = await c.req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return jsonError("No image provided.", 400);
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return jsonError("Server icon must be 1 MB or smaller.", 400);
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_AVATAR_TYPES.has(contentType)) {
    return jsonError("Server icon must be a PNG, JPEG, or WebP image.", 400);
  }

  const extension = extensionForAvatarType(contentType);
  if (!extension) {
    return jsonError("Server icon must be a PNG, JPEG, or WebP image.", 400);
  }

  const storageKey = serverIconStorageKey(server.id, extension);

  if (server.icon_url && server.icon_url !== storageKey) {
    await c.env.ATTACHMENTS.delete(server.icon_url);
  }

  await c.env.ATTACHMENTS.put(storageKey, file.stream(), {
    httpMetadata: { contentType },
  });

  await c.env.DB.prepare("UPDATE servers SET icon_url = ? WHERE id = ?")
    .bind(storageKey, server.id)
    .run();

  const updated = await requireServerMember(c, user, server.id);
  if (updated instanceof Response) {
    return updated;
  }

  return c.json({ server: mapServer(updated) });
});

app.get("/api/servers/:serverId/icon", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  if (!server.icon_url) {
    return jsonError("Server icon not found.", 404);
  }

  if (!c.env.ATTACHMENTS) {
    return jsonError("File storage is unavailable.", 503);
  }

  const object = await c.env.ATTACHMENTS.get(server.icon_url);
  if (!object) {
    return jsonError("Server icon file not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, no-cache");

  return new Response(object.body, { headers });
});

app.post("/api/servers/:serverId/invite/regenerate", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerOwner(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const inviteCode = await generateUniqueInviteCode(c.env.DB);
  await c.env.DB.prepare("UPDATE servers SET invite_code = ? WHERE id = ?")
    .bind(inviteCode, server.id)
    .run();

  const updated = await requireServerMember(c, user, server.id);
  if (updated instanceof Response) {
    return updated;
  }

  return c.json({ server: mapServer(updated) });
});

app.get("/api/servers/:serverId/members", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const members = await getAllRankedServerMembers(c.env.DB, server.id, server.owner_id);
  return c.json({
    members: members.map((member) => ({
      id: member.membershipId,
      userId: member.userId,
      username: member.username,
      displayName: member.displayName,
      nickname: member.nickname,
      joinedAt: member.joinedAt,
      isOwner: member.isOwner,
      avatarUrl: member.avatarUrl,
      displayRole: member.displayRole,
    })),
  });
});

app.post("/api/servers/:serverId/presence/heartbeat", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  await touchServerPresence(c.env.DB, server.id, user.sub);
  return c.json({ ok: true });
});

app.get("/api/servers/:serverId/online-members", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  await touchServerPresence(c.env.DB, server.id, user.sub);
  return c.json(await mapOnlineMembersForServer(c, server));
});

app.delete("/api/servers/:serverId/members/:userId", async (c) => {
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
    return jsonError("You cannot remove the server owner.", 400);
  }

  const allowed =
    server.owner_id === user.sub ||
    (await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "kick_members",
    ));
  if (!allowed) {
    return jsonError("You do not have permission to kick members.", 403);
  }

  await c.env.DB.prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
    .bind(server.id, targetUserId)
    .run();

  await writeAuditLog(c.env.DB, {
    serverId: server.id,
    actorUserId: user.sub,
    actionType: "member_kick",
    targetType: "user",
    targetId: targetUserId,
  });

  return c.json({ ok: true });
});

app.post("/api/servers/:serverId/leave", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  if (server.owner_id === user.sub) {
    return jsonError("Owners must transfer ownership or delete the server instead of leaving.", 400);
  }

  await c.env.DB.prepare("DELETE FROM server_members WHERE server_id = ? AND user_id = ?")
    .bind(server.id, user.sub)
    .run();

  return c.json({ ok: true });
});

app.delete("/api/servers/:serverId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerOwner(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  if (server.icon_url && c.env.ATTACHMENTS) {
    await c.env.ATTACHMENTS.delete(server.icon_url);
  }

  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM member_roles WHERE server_id = ?").bind(server.id),
    c.env.DB.prepare("DELETE FROM server_roles WHERE server_id = ?").bind(server.id),
    c.env.DB.prepare("DELETE FROM channels WHERE server_id = ?").bind(server.id),
    c.env.DB.prepare("DELETE FROM server_members WHERE server_id = ?").bind(server.id),
    c.env.DB.prepare("DELETE FROM servers WHERE id = ?").bind(server.id),
  ]);

  return c.json({ ok: true });
});

app.get("/api/servers/:serverId/channels", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const rows = await listServerChannels(c.env.DB, server.id);
  return c.json({
    channels: rows.map((row) => mapChannel(row)),
  });
});

app.post("/api/servers/:serverId/channels", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const canManage = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "manage_channels",
  );
  if (!canManage) {
    return jsonError("You do not have permission to create channels.", 403);
  }

  const body = await c.req.json<{ name?: string; type?: ChannelType }>();
  const input = {
    name: body.name ?? "",
    type: body.type ?? "text",
  };

  const validationError = validateCreateChannel(input);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const name = normalizeChannelName(input.name);
  const existing = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE server_id = ? AND name = ? COLLATE NOCASE LIMIT 1",
  )
    .bind(server.id, name)
    .first<{ id: string }>();

  if (existing) {
    return jsonError("A channel with that name already exists.", 409);
  }

  const channelId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO channels (id, server_id, name, type) VALUES (?, ?, ?, ?)",
  )
    .bind(channelId, server.id, name, input.type)
    .run();

  const channel = await getServerChannel(c.env.DB, server.id, channelId);

  if (!channel) {
    return jsonError("Channel could not be created.", 500);
  }

  return c.json({ channel: mapChannel(channel) }, 201);
});

app.patch("/api/servers/:serverId/channels/:channelId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const canManage = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "manage_channels",
  );
  if (!canManage) {
    return jsonError("You do not have permission to edit channels.", 403);
  }

  const channelId = c.req.param("channelId");
  const existing = await getServerChannel(c.env.DB, server.id, channelId);

  if (!existing) {
    return jsonError("Channel not found.", 404);
  }

  const body = await c.req.json<UpdateChannelInput>();
  const validationError = validateUpdateChannel(body);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (body.name !== undefined) {
    const name = normalizeChannelName(body.name);
    if (name !== existing.name) {
      const duplicate = await c.env.DB.prepare(
        "SELECT id FROM channels WHERE server_id = ? AND name = ? COLLATE NOCASE AND id != ? LIMIT 1",
      )
        .bind(server.id, name, channelId)
        .first<{ id: string }>();

      if (duplicate) {
        return jsonError("A channel with that name already exists.", 409);
      }
    }
    updates.push("name = ?");
    values.push(name);
  }

  if (body.voiceBitrate !== undefined) {
    updates.push("voice_bitrate = ?");
    values.push(body.voiceBitrate);
  }
  if (body.voiceUserLimit !== undefined) {
    updates.push("voice_user_limit = ?");
    values.push(body.voiceUserLimit);
  }
  if (body.voicePttOnly !== undefined) {
    updates.push("voice_ptt_only = ?");
    values.push(body.voicePttOnly ? 1 : 0);
  }
  if (body.topic !== undefined) {
    updates.push("topic = ?");
    values.push(body.topic.trim());
  }
  if (body.slowModeSeconds !== undefined) {
    updates.push("slow_mode_seconds = ?");
    values.push(body.slowModeSeconds);
  }
  if (body.nsfw !== undefined) {
    updates.push("nsfw = ?");
    values.push(body.nsfw ? 1 : 0);
  }
  if (body.categoryId !== undefined) {
    updates.push("category_id = ?");
    values.push(body.categoryId ?? "");
  }
  if (body.position !== undefined) {
    updates.push("position = ?");
    values.push(body.position);
  }

  if (updates.length === 0) {
    return jsonError("No channel changes to save.", 400);
  }

  values.push(channelId);
  await c.env.DB.prepare(`UPDATE channels SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const channel = await getServerChannel(c.env.DB, server.id, channelId);

  if (!channel) {
    return jsonError("Channel not found.", 404);
  }

  return c.json({ channel: mapChannel(channel) });
});

app.delete("/api/servers/:serverId/channels/:channelId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const canManage = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "manage_channels",
  );
  if (!canManage) {
    return jsonError("You do not have permission to delete channels.", 403);
  }

  const channelId = c.req.param("channelId");
  const existing = await c.env.DB.prepare(
    "SELECT id FROM channels WHERE id = ? AND server_id = ? LIMIT 1",
  )
    .bind(channelId, server.id)
    .first<{ id: string }>();

  if (!existing) {
    return jsonError("Channel not found.", 404);
  }

  await c.env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(channelId).run();
  return c.json({ ok: true });
});

app.get("/api/servers/:serverId/channels/:channelId/voice", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  if (!c.env.VOICE_ROOM) {
    return jsonError("Voice service is unavailable. Restart the dev server.", 503);
  }

  const channelId = c.req.param("channelId");
  const channel = await getServerChannel(c.env.DB, server.id, channelId);

  if (!channel) {
    return jsonError("Channel not found.", 404);
  }

  if (!isVoiceLikeType(channel.type)) {
    return jsonError("This channel is not a voice channel.", 400);
  }

  const verificationError = await checkVerificationLevel(c.env.DB, server, user.sub);
  if (verificationError) {
    return jsonError(verificationError, 403);
  }

  const canConnect = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "connect_voice",
  );
  if (!canConnect) {
    return jsonError("You do not have permission to join voice channels.", 403);
  }

  if (await isMemberTimedOut(c.env.DB, server.id, user.sub)) {
    return jsonError("You are timed out and cannot join voice channels.", 403);
  }

  const canSpeak = await memberHasPermission(
    c.env.DB,
    server.id,
    user.sub,
    server.owner_id,
    "speak_voice",
  );

  const profile = await c.env.DB.prepare(
    "SELECT username, display_name FROM users WHERE id = ? LIMIT 1",
  )
    .bind(user.sub)
    .first<{ username: string; display_name: string }>();

  if (!profile) {
    return jsonError("User not found.", 404);
  }

  let displayName = profile.display_name;
  try {
    const nicknameRow = await c.env.DB.prepare(
      "SELECT nickname FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
    )
      .bind(server.id, user.sub)
      .first<{ nickname: string | null }>();
    if (nicknameRow?.nickname?.trim()) {
      displayName = nicknameRow.nickname.trim();
    }
  } catch {
    // nickname column may not exist before migration.
  }

  try {
    const headers = new Headers(c.req.raw.headers);
    headers.set("X-User-Id", user.sub);
    headers.set("X-Display-Name", displayName);
    headers.set("X-Username", profile.username);
    headers.set("X-Voice-User-Limit", String(resolveVoiceUserLimit(channel.voice_user_limit)));
    headers.set("X-Can-Speak", canSpeak ? "1" : "0");
    headers.set("X-Server-Id", server.id);

    const callsSessionId = new URL(c.req.url).searchParams.get("callsSessionId");
    if (callsSessionId?.trim()) {
      headers.set("X-Calls-Session-Id", callsSessionId.trim());
    }

    const roomId = c.env.VOICE_ROOM.idFromName(channelId);
    const stub = c.env.VOICE_ROOM.get(roomId);
    const upgradeRequest = new Request(c.req.raw, { headers });
    return await stub.fetch(upgradeRequest);
  } catch {
    return jsonError("Voice connection failed. Restart the dev server.", 500);
  }
});

app.get("/api/servers/:serverId/permissions/me", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleGetMyPermissions(c, user, c.req.param("serverId"));
});

app.get("/api/servers/:serverId/channels/:channelId/messages", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleListMessages(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.get("/api/servers/:serverId/channels/:channelId/thread-counts", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleGetThreadCounts(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.post("/api/servers/:serverId/channels/:channelId/messages", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleCreateMessage(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.patch("/api/servers/:serverId/channels/:channelId/messages/:messageId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleUpdateMessage(
    c,
    user,
    c.req.param("serverId"),
    c.req.param("channelId"),
    c.req.param("messageId"),
  );
});

app.delete("/api/servers/:serverId/channels/:channelId/messages/:messageId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleDeleteMessage(
    c,
    user,
    c.req.param("serverId"),
    c.req.param("channelId"),
    c.req.param("messageId"),
  );
});

app.post("/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleAddReaction(
    c,
    user,
    c.req.param("serverId"),
    c.req.param("channelId"),
    c.req.param("messageId"),
  );
});

app.delete(
  "/api/servers/:serverId/channels/:channelId/messages/:messageId/reactions/:emoji",
  async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) {
      return user;
    }
    return handleRemoveReaction(
      c,
      user,
      c.req.param("serverId"),
      c.req.param("channelId"),
      c.req.param("messageId"),
      c.req.param("emoji"),
    );
  },
);

app.put("/api/servers/:serverId/channels/:channelId/messages/:messageId/pin", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handlePinMessage(
    c,
    user,
    c.req.param("serverId"),
    c.req.param("channelId"),
    c.req.param("messageId"),
  );
});

app.delete("/api/servers/:serverId/channels/:channelId/messages/:messageId/pin", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleUnpinMessage(
    c,
    user,
    c.req.param("serverId"),
    c.req.param("channelId"),
    c.req.param("messageId"),
  );
});

app.get("/api/servers/:serverId/channels/:channelId/pins", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleListPins(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.post("/api/servers/:serverId/channels/:channelId/read", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleMarkRead(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.post("/api/servers/:serverId/channels/:channelId/attachments", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleUploadAttachment(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

app.get("/api/servers/:serverId/attachments/:attachmentId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleGetAttachment(c, user, c.req.param("serverId"), c.req.param("attachmentId"));
});

app.get("/api/servers/:serverId/channels/:channelId/text", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }
  return handleTextWebSocket(c, user, c.req.param("serverId"), c.req.param("channelId"));
});

async function loadServerRoles(db: D1Database, serverId: string) {
  const rolesResult = await db
    .prepare(
      `SELECT id, server_id, name, color, position, permissions, is_everyone, is_managed, created_at
       FROM server_roles WHERE server_id = ?
       ORDER BY position DESC, created_at ASC`,
    )
    .bind(serverId)
    .all<RoleRow>();

  const roles = rolesResult.results ?? [];
  const membersResult = await db
    .prepare(
      "SELECT user_id, role_id FROM member_roles WHERE server_id = ?",
    )
    .bind(serverId)
    .all<{ user_id: string; role_id: string }>();

  const assignments = membersResult.results ?? [];
  const memberIdsByRole = new Map<string, string[]>();
  const countsByRole = new Map<string, number>();

  for (const assignment of assignments) {
    const list = memberIdsByRole.get(assignment.role_id) ?? [];
    list.push(assignment.user_id);
    memberIdsByRole.set(assignment.role_id, list);
    countsByRole.set(assignment.role_id, (countsByRole.get(assignment.role_id) ?? 0) + 1);
  }

  return roles.map((row) => ({
    ...mapRole(row, countsByRole.get(row.id) ?? 0),
    memberIds: memberIdsByRole.get(row.id) ?? [],
  }));
}

async function requireManageRoles(
  c: Context<{ Bindings: Env }>,
  user: TokenPayload,
  server: { id: string; owner_id: string },
): Promise<true | Response> {
  const allowed = await userCanManageRoles(c.env.DB, server.id, user.sub, server.owner_id);
  if (!allowed) {
    return Response.json({ error: "You do not have permission to manage roles." }, { status: 403 });
  }
  return true;
}

app.get("/api/servers/:serverId/roles", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  await ensureDefaultRoles(c.env.DB, server.id, server.owner_id);
  const roles = await loadServerRoles(c.env.DB, server.id);
  const canManage = await userCanManageRoles(c.env.DB, server.id, user.sub, server.owner_id);
  return c.json({ roles, canManage });
});

app.post("/api/servers/:serverId/roles", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageRoles(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const body = await c.req.json<CreateRoleInput>();
  const validationError = validateCreateRole(body);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const permissions = sanitizePermissions(body.permissions);
  const roleId = crypto.randomUUID();
  const maxPosition = await c.env.DB.prepare(
    "SELECT MAX(position) as max_pos FROM server_roles WHERE server_id = ?",
  )
    .bind(server.id)
    .first<{ max_pos: number | null }>();

  const position = Math.min((maxPosition?.max_pos ?? 0) + 1, 99);

  await c.env.DB.prepare(
    `INSERT INTO server_roles (id, server_id, name, color, position, permissions)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      roleId,
      server.id,
      body.name.trim(),
      body.color ?? "#14b8a6",
      position,
      JSON.stringify(permissions),
    )
    .run();

  const roles = await loadServerRoles(c.env.DB, server.id);
  const created = roles.find((role) => role.id === roleId);
  if (!created) {
    return jsonError("Role could not be created.", 500);
  }

  return c.json({ role: created }, 201);
});

app.patch("/api/servers/:serverId/roles/:roleId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageRoles(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const roleId = c.req.param("roleId");
  const existing = await c.env.DB.prepare(
    "SELECT id, server_id, name, color, position, permissions, is_everyone, is_managed, created_at FROM server_roles WHERE id = ? AND server_id = ? LIMIT 1",
  )
    .bind(roleId, server.id)
    .first<RoleRow>();

  if (!existing) {
    return jsonError("Role not found.", 404);
  }

  const body = await c.req.json<UpdateRoleInput>();
  const validationError = validateUpdateRole(body);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  const updates: string[] = [];
  const values: Array<string | number> = [];

  if (body.name !== undefined && existing.is_everyone === 0 && existing.is_managed === 0) {
    updates.push("name = ?");
    values.push(body.name.trim());
  }
  if (body.color !== undefined) {
    updates.push("color = ?");
    values.push(body.color);
  }
  if (body.position !== undefined) {
    updates.push("position = ?");
    values.push(body.position);
  }
  if (body.permissions !== undefined) {
    updates.push("permissions = ?");
    values.push(JSON.stringify(sanitizePermissions(body.permissions)));
  }

  if (updates.length === 0) {
    return jsonError("No role changes to save.", 400);
  }

  values.push(roleId);
  await c.env.DB.prepare(`UPDATE server_roles SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  const roles = await loadServerRoles(c.env.DB, server.id);
  const updated = roles.find((role) => role.id === roleId);
  if (!updated) {
    return jsonError("Role not found.", 404);
  }

  return c.json({ role: updated });
});

app.delete("/api/servers/:serverId/roles/:roleId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageRoles(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const roleId = c.req.param("roleId");
  const existing = await c.env.DB.prepare(
    "SELECT id, is_everyone, is_managed FROM server_roles WHERE id = ? AND server_id = ? LIMIT 1",
  )
    .bind(roleId, server.id)
    .first<{ id: string; is_everyone: number; is_managed: number }>();

  if (!existing) {
    return jsonError("Role not found.", 404);
  }

  if (existing.is_everyone === 1 || existing.is_managed === 1) {
    return jsonError("This role cannot be deleted.", 400);
  }

  await c.env.DB.prepare("DELETE FROM server_roles WHERE id = ?").bind(roleId).run();
  return c.json({ ok: true });
});

app.post("/api/servers/:serverId/members/:userId/roles/:roleId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageRoles(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const targetUserId = c.req.param("userId");
  const roleId = c.req.param("roleId");

  const membership = await c.env.DB.prepare(
    "SELECT id FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
  )
    .bind(server.id, targetUserId)
    .first<{ id: string }>();

  if (!membership) {
    return jsonError("Member not found.", 404);
  }

  const role = await c.env.DB.prepare(
    "SELECT id, is_everyone FROM server_roles WHERE id = ? AND server_id = ? LIMIT 1",
  )
    .bind(roleId, server.id)
    .first<{ id: string; is_everyone: number }>();

  if (!role) {
    return jsonError("Role not found.", 404);
  }

  if (role.is_everyone === 1) {
    return jsonError("@everyone is assigned to all members automatically.", 400);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ? LIMIT 1",
  )
    .bind(server.id, targetUserId, roleId)
    .first<{ id: string }>();

  if (!existing) {
    await c.env.DB.prepare(
      "INSERT INTO member_roles (id, server_id, user_id, role_id) VALUES (?, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), server.id, targetUserId, roleId)
      .run();
  }

  return c.json({ ok: true });
});

app.delete("/api/servers/:serverId/members/:userId/roles/:roleId", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) {
    return user;
  }

  const server = await requireServerMember(c, user, c.req.param("serverId"));
  if (server instanceof Response) {
    return server;
  }

  const allowed = await requireManageRoles(c, user, server);
  if (allowed instanceof Response) {
    return allowed;
  }

  const targetUserId = c.req.param("userId");
  const roleId = c.req.param("roleId");

  if (targetUserId === server.owner_id) {
    const ownerRole = await c.env.DB.prepare(
      "SELECT id FROM server_roles WHERE server_id = ? AND name = 'Owner' AND is_managed = 1 LIMIT 1",
    )
      .bind(server.id)
      .first<{ id: string }>();

    if (ownerRole?.id === roleId) {
      return jsonError("Cannot remove the Owner role from the server owner.", 400);
    }
  }

  await c.env.DB.prepare(
    "DELETE FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id = ?",
  )
    .bind(server.id, targetUserId, roleId)
    .run();

  return c.json({ ok: true });
});

registerSafetyRoutes(app);
registerDiscordRoutes(app);
registerDiscordExtraRoutes(app);
registerDiscordCompletionRoutes(app);
registerBotRoutes(app);
registerOAuthRoutes(app);
registerPlatformRoutes(app);
registerForumRoutes(app);
registerCallsRoutes(app);

export default app;
