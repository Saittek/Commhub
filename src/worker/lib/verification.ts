export interface VerificationServer {
  id: string;
  owner_id: string;
  verification_level: number;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function checkVerificationLevel(
  db: D1Database,
  server: VerificationServer,
  userId: string,
): Promise<string | null> {
  if (userId === server.owner_id || server.verification_level === 0) {
    return null;
  }

  if (server.verification_level >= 1) {
    const user = await db
      .prepare("SELECT email_verified FROM users WHERE id = ? LIMIT 1")
      .bind(userId)
      .first<{ email_verified: number }>();

    if (!user || user.email_verified !== 1) {
      return "You must verify your email before you can do that. Open User Settings → Privacy & Safety.";
    }
  }

  if (server.verification_level >= 2) {
    const membership = await db
      .prepare(
        "SELECT joined_at FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
      )
      .bind(server.id, userId)
      .first<{ joined_at: string }>();

    if (
      membership &&
      Date.now() - Date.parse(membership.joined_at) < FIVE_MINUTES_MS
    ) {
      return "You must be a member of this server for at least 5 minutes before you can do that.";
    }
  }

  if (server.verification_level >= 3) {
    const membership = await db
      .prepare(
        "SELECT joined_at FROM server_members WHERE server_id = ? AND user_id = ? LIMIT 1",
      )
      .bind(server.id, userId)
      .first<{ joined_at: string }>();

    if (
      membership &&
      Date.now() - Date.parse(membership.joined_at) < TEN_MINUTES_MS
    ) {
      return "You must be a member of this server for at least 10 minutes before you can do that.";
    }
  }

  return null;
}
