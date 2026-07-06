export interface WatchTogetherMetadata {
  videoUrl?: string;
}

export function parseWatchTogetherMetadata(raw: string | null | undefined): WatchTogetherMetadata {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as WatchTogetherMetadata;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function toYouTubeEmbedUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const id = url.searchParams.get("v");
      if (id) {
        return `https://www.youtube-nocookie.com/embed/${id}`;
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.indexOf("embed");
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube-nocookie.com/embed/${parts[embedIndex + 1]}`;
      }
      const shortIndex = parts.indexOf("shorts");
      if (shortIndex >= 0 && parts[shortIndex + 1]) {
        return `https://www.youtube-nocookie.com/embed/${parts[shortIndex + 1]}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}
