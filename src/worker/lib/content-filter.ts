const EXPLICIT_FILENAME_PATTERN =
  /\b(nsfw|xxx|porn|nude|naked|sex|hentai|onlyfans)\b/i;

const EXPLICIT_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function shouldScanAttachment(contentType: string): boolean {
  return EXPLICIT_CONTENT_TYPES.has(contentType);
}

export function isExplicitFilename(filename: string): boolean {
  return EXPLICIT_FILENAME_PATTERN.test(filename);
}

export function rejectExplicitUpload(
  filename: string,
  contentType: string,
  serverFilterEnabled: boolean,
  userFilterEnabled: boolean,
): string | null {
  if (!serverFilterEnabled && !userFilterEnabled) {
    return null;
  }

  if (!shouldScanAttachment(contentType)) {
    return null;
  }

  if (isExplicitFilename(filename)) {
    return "This file was blocked by the explicit content filter.";
  }

  return null;
}
