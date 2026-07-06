const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const FETCH_TIMEOUT_MS = 5000;
const MAX_EMBEDS_PER_MESSAGE = 3;

export interface EmbedPreview {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const raw of matches) {
    const trimmed = raw.replace(/[.,!?;:]+$/, "");
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }
      const normalized = url.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return urls.slice(0, MAX_EMBEDS_PER_MESSAGE);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  return false;
}

export function isAllowedEmbedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return !isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function readTitleTag(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

export async function fetchEmbedPreview(rawUrl: string): Promise<EmbedPreview | null> {
  if (!isAllowedEmbedUrl(rawUrl)) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "CommhubEmbedBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    const html = (await response.text()).slice(0, 256_000);
    const url = new URL(rawUrl);

    return {
      url: rawUrl,
      title: readMetaContent(html, "og:title") ?? readTitleTag(html),
      description: readMetaContent(html, "og:description") ?? readMetaContent(html, "description"),
      imageUrl: readMetaContent(html, "og:image"),
      siteName: readMetaContent(html, "og:site_name") ?? url.hostname,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function storeEmbedsForMessage(
  db: D1Database,
  messageId: string,
  urls: string[],
): Promise<EmbedPreview[]> {
  const stored: EmbedPreview[] = [];

  for (const url of urls) {
    const preview = await fetchEmbedPreview(url);
    if (!preview) {
      continue;
    }

    await db
      .prepare(
        `INSERT INTO message_embeds (id, message_id, url, title, description, image_url, site_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        messageId,
        preview.url,
        preview.title,
        preview.description,
        preview.imageUrl,
        preview.siteName,
      )
      .run();

    stored.push(preview);
  }

  return stored;
}
