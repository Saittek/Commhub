interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importVapidPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const padding = "=".repeat((4 - (privateKeyBase64.length % 4)) % 4);
  const base64 = (privateKeyBase64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    raw.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function createVapidJwt(
  privateKey: string,
  endpoint: string,
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: "mailto:commhub@local",
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const key = await importVapidPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigBytes = new Uint8Array(signature);
  const jwtSig = base64UrlEncode(sigBytes);
  return `${unsigned}.${jwtSig}`;
}

async function sendWebPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<void> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return;
  }

  const jwt = await createVapidJwt(privateKey, sub.endpoint);
  const body = JSON.stringify(payload);

  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Content-Type": "application/json",
      TTL: "86400",
    },
    body,
  });

  if (response.status === 404 || response.status === 410) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")
      .bind(sub.endpoint)
      .run();
  }
}

export async function sendPushToUsers(
  env: Env,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || userIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(userIds)];
  const placeholders = uniqueIds.map(() => "?").join(", ");

  const rows = await env.DB.prepare(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
  )
    .bind(...uniqueIds)
    .all<PushSubscriptionRow>();

  const subs = rows.results ?? [];
  await Promise.allSettled(subs.map((sub) => sendWebPush(env, sub, payload)));
}

export async function notifyChannelMessage(
  env: Env,
  serverId: string,
  channelId: string,
  channelName: string,
  authorId: string,
  authorName: string,
  content: string,
  mentionUserIds: string[],
): Promise<void> {
  const recipients = new Set<string>();

  for (const userId of mentionUserIds) {
    if (userId !== authorId) {
      recipients.add(userId);
    }
  }

  if (recipients.size === 0) {
    const members = await env.DB.prepare(
      "SELECT user_id FROM server_members WHERE server_id = ? AND user_id != ?",
    )
      .bind(serverId, authorId)
      .all<{ user_id: string }>();

    for (const row of members.results ?? []) {
      const prefs = await env.DB.prepare(
        "SELECT default_notifications FROM users WHERE id = ? LIMIT 1",
      )
        .bind(row.user_id)
        .first<{ default_notifications: string }>();

      const channelPref = await env.DB.prepare(
        "SELECT level FROM channel_notification_settings WHERE user_id = ? AND channel_id = ? LIMIT 1",
      )
        .bind(row.user_id, channelId)
        .first<{ level: string }>();

      const level = channelPref?.level ?? prefs?.default_notifications ?? "all";
      if (level === "all" || level === "mentions") {
        recipients.add(row.user_id);
      }
    }
  }

  if (recipients.size === 0) {
    return;
  }

  const preview = content.slice(0, 120) || "New message";
  await sendPushToUsers(env, [...recipients], {
    title: `#${channelName}`,
    body: `${authorName}: ${preview}`,
    url: `/app`,
  });
}

export async function notifyDmMessage(
  env: Env,
  channelId: string,
  authorId: string,
  authorName: string,
  content: string,
): Promise<void> {
  const participants = await env.DB.prepare(
    "SELECT user_id FROM dm_participants WHERE channel_id = ? AND user_id != ?",
  )
    .bind(channelId, authorId)
    .all<{ user_id: string }>();

  const userIds = (participants.results ?? []).map((row) => row.user_id);
  if (userIds.length === 0) {
    return;
  }

  const preview = content.slice(0, 120) || "New message";
  await sendPushToUsers(env, userIds, {
    title: authorName,
    body: preview,
    url: `/app`,
  });
}
