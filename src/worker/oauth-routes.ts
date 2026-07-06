import type { Hono } from "hono";
import { isSecureRequest, setSessionCookie, signToken } from "./lib/auth";
import { getUserRow } from "./lib/users";
import type { TokenPayload } from "./lib/auth";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}

const OAUTH_STATE_COOKIE = "commhub_oauth_state";

function oauthConfigured(c: { env: Env }): boolean {
  return Boolean(c.env.GITHUB_CLIENT_ID && c.env.GITHUB_CLIENT_SECRET);
}

export function registerOAuthRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/auth/oauth/github", async (c) => {
    if (!oauthConfigured(c)) {
      return jsonError("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.", 503);
    }

    const state = crypto.randomUUID();
    const secure = isSecureRequest(c.req.raw);
    const stateCookie = `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`;

    const redirectUri = new URL("/api/auth/oauth/github/callback", c.req.url).toString();
    const params = new URLSearchParams({
      client_id: c.env.GITHUB_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: "read:user user:email",
      state,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `https://github.com/login/oauth/authorize?${params}`,
        "Set-Cookie": stateCookie,
      },
    });
  });

  app.get("/api/auth/oauth/github/callback", async (c) => {
    if (!oauthConfigured(c)) {
      return jsonError("GitHub OAuth is not configured.", 503);
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const cookieState = c.req
      .header("Cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
      ?.split("=")[1];

    if (!code || !state || !cookieState || state !== cookieState) {
      return jsonError("Invalid OAuth state.", 400);
    }

    const redirectUri = new URL("/api/auth/oauth/github/callback", c.req.url).toString();
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return jsonError(tokenData.error ?? "OAuth token exchange failed.", 400);
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Commhub",
      },
    });

    const ghUser = (await userResponse.json()) as {
      id: number;
      login: string;
      name?: string | null;
      email?: string | null;
    };

    if (!ghUser.id) {
      return jsonError("Could not load GitHub profile.", 400);
    }

    const providerUserId = String(ghUser.id);
    let email = ghUser.email ?? `${ghUser.login}@users.noreply.github.com`;

    if (!ghUser.email) {
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Commhub",
        },
      });
      const emails = (await emailsResponse.json()) as Array<{ email: string; primary: boolean }>;
      const primary = emails.find((e) => e.primary) ?? emails[0];
      if (primary?.email) {
        email = primary.email;
      }
    }

    const existingOAuth = await c.env.DB.prepare(
      "SELECT user_id FROM oauth_accounts WHERE provider = 'github' AND provider_user_id = ? LIMIT 1",
    )
      .bind(providerUserId)
      .first<{ user_id: string }>();

    let userId = existingOAuth?.user_id ?? null;

    if (!userId) {
      const existingEmail = await c.env.DB.prepare(
        "SELECT id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1",
      )
        .bind(email)
        .first<{ id: string }>();

      userId = existingEmail?.id ?? newId();

      if (!existingEmail) {
        const username = `gh_${ghUser.login}`.slice(0, 32).toLowerCase();
        await c.env.DB.prepare(
          `INSERT INTO users (id, username, email, password_hash, password_salt, display_name, email_verified)
           VALUES (?, ?, ?, '', '', ?, 1)`,
        )
          .bind(userId, username, email, ghUser.name ?? ghUser.login)
          .run();
      }

      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO oauth_accounts (id, user_id, provider, provider_user_id, email) VALUES (?, ?, 'github', ?, ?)",
      )
        .bind(newId(), userId, providerUserId, email)
        .run();
    }

    const row = await getUserRow(c.env.DB, userId);
    if (!row) {
      return jsonError("User account could not be loaded.", 500);
    }

    const payload: TokenPayload = {
      sub: userId,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
    };

    const token = await signToken(payload, c.env.JWT_SECRET);
    const sessionCookie = setSessionCookie(token, isSecureRequest(c.req.raw));
    const clearState = `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Max-Age=0`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/app",
        "Set-Cookie": [sessionCookie, clearState].join(", "),
      },
    });
  });

  app.get("/api/auth/oauth/status", async (c) => {
    return c.json({
      github: oauthConfigured(c),
      google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    });
  });
}
