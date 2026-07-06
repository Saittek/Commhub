const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createResetToken(): string {
  const id = crypto.randomUUID();
  const secret = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  return `${id}.${secret}`;
}

export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function resetTokenExpiresAt(): string {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
}

export function isResetTokenExpired(expiresAt: string): boolean {
  return Date.parse(expiresAt) <= Date.now();
}
