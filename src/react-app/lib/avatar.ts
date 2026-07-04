export const AVATAR_SIZE = 128;
export const MAX_AVATAR_BYTES = 1024 * 1024;
export const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function resolveImageMime(file: File): string | null {
  if (ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return file.type;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "webp") {
    return "image/webp";
  }

  return null;
}

export async function validateAvatarSourceFile(file: File): Promise<void> {
  if (!resolveImageMime(file)) {
    throw new Error("Avatar must be a PNG, JPEG, or WebP image.");
  }

  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error("Image must be 8 MB or smaller.");
  }
}

export function userInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function serverInitials(serverName: string): string {
  const trimmed = serverName.trim();
  if (!trimmed) {
    return "??";
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}
