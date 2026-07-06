const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])/g;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;
const CODE_BLOCK_PATTERN = /```(?:[\w-]*\n)?([\s\S]*?)```/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const ITALIC_PATTERN = /\*([^*]+)\*/g;
const STRIKETHROUGH_PATTERN = /~~([^~]+)~~/g;
const SPOILER_PATTERN = /\|\|([^|]+)\|\|/g;
const CUSTOM_EMOJI_PATTERN = /:([a-zA-Z0-9_]{2,32}):/g;
const MENTION_PATTERN = /(^|[\s>])@([a-zA-Z0-9_.-]{2,32})\b/g;
const EVERYONE_PATTERN = /@(everyone|here)\b/gi;

export interface MessageEmbed {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  color?: string;
  siteName?: string | null;
  thumbnail?: string | null;
}

export function formatMessageTime(iso: string): string {
  const date = parseMessageDate(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${year}-${month}-${day} ${time}`;
}

export function formatMessageTimeCompact(iso: string): string {
  const date = parseMessageDate(iso);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function parseMessageDate(iso: string): Date {
  return new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
}

export function isDifferentDay(a: string, b: string): boolean {
  return parseMessageDate(a).toDateString() !== parseMessageDate(b).toDateString();
}

export function formatDateDivider(iso: string): string {
  const date = parseMessageDate(iso);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInlineFormatting(html: string, emojis?: Record<string, string>): string {
  html = html.replace(INLINE_CODE_PATTERN, "<code>$1</code>");
  html = html.replace(BOLD_PATTERN, "<strong>$1</strong>");
  html = html.replace(ITALIC_PATTERN, "<em>$1</em>");
  html = html.replace(STRIKETHROUGH_PATTERN, "<del>$1</del>");
  html = html.replace(
    SPOILER_PATTERN,
    '<span class="message-spoiler" tabindex="0" role="button">$1</span>',
  );

  if (emojis) {
    html = html.replace(CUSTOM_EMOJI_PATTERN, (match, name: string) => {
      const url = emojis[name.toLowerCase()];
      if (!url) {
        return match;
      }
      return `<img class="message-custom-emoji" src="${escapeHtml(url)}" alt=":${name}:" title=":${name}:" />`;
    });
  }

  html = html.replace(
    EVERYONE_PATTERN,
    '<span class="message-mention everyone">@$1</span>',
  );
  html = html.replace(
    MENTION_PATTERN,
    '$1<span class="message-mention">@$2</span>',
  );
  html = html.replace(
    URL_PATTERN,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return html;
}

function formatPlainLine(line: string, emojis?: Record<string, string>): string {
  return applyInlineFormatting(escapeHtml(line), emojis);
}

export function renderMessageContent(
  content: string,
  emojis?: Record<string, string>,
): string {
  const codeBlocks: string[] = [];
  let working = content.replace(CODE_BLOCK_PATTERN, (_match, code: string) => {
    const index = codeBlocks.length;
    codeBlocks.push(`<pre class="message-code-block"><code>${escapeHtml(code.trimEnd())}</code></pre>`);
    return `\x00CODE${index}\x00`;
  });

  const lines = working.split("\n");
  const htmlParts: string[] = [];
  let blockquoteBuffer: string[] = [];

  function flushBlockquote() {
    if (blockquoteBuffer.length === 0) {
      return;
    }
    const inner = blockquoteBuffer
      .map((line) => formatPlainLine(line.replace(/^>\s?/, ""), emojis))
      .join("<br />");
    htmlParts.push(`<blockquote class="message-blockquote">${inner}</blockquote>`);
    blockquoteBuffer = [];
  }

  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      blockquoteBuffer.push(line);
      continue;
    }
    flushBlockquote();

    if (/^\x00CODE\d+\x00$/.test(line.trim())) {
      htmlParts.push(line.trim());
    } else if (line.includes("\x00CODE")) {
      const segments = line.split(/(\x00CODE\d+\x00)/);
      for (const segment of segments) {
        if (/^\x00CODE\d+\x00$/.test(segment)) {
          htmlParts.push(segment);
        } else if (segment) {
          htmlParts.push(formatPlainLine(segment, emojis));
        }
      }
    } else {
      htmlParts.push(formatPlainLine(line, emojis));
    }
  }
  flushBlockquote();

  let html = htmlParts.join("<br />");
  for (let i = 0; i < codeBlocks.length; i++) {
    html = html.replace(`\x00CODE${i}\x00`, codeBlocks[i]!);
  }

  return html;
}

export function renderEmbedHtml(embed: MessageEmbed): string {
  const color = embed.color ? escapeHtml(embed.color) : "#14b8a6";
  const url = embed.url ? escapeHtml(embed.url) : "";
  const title = embed.title ? escapeHtml(embed.title) : "";
  const description = embed.description ? escapeHtml(embed.description) : "";
  const siteName = embed.siteName ? escapeHtml(embed.siteName) : "";
  const image = embed.imageUrl ?? embed.image ?? "";
  const imageSrc = image ? escapeHtml(image) : "";
  const thumbnail = embed.thumbnail ? escapeHtml(embed.thumbnail) : "";

  const titleHtml = title
    ? url
      ? `<a class="message-embed-title" href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : `<span class="message-embed-title">${title}</span>`
    : "";

  const descriptionHtml = description
    ? `<div class="message-embed-description">${description.replace(/\n/g, "<br />")}</div>`
    : "";

  const siteHtml = siteName ? `<span class="message-embed-site">${siteName}</span>` : "";

  const thumbHtml = thumbnail
    ? `<img class="message-embed-thumbnail" src="${thumbnail}" alt="" loading="lazy" />`
    : "";

  const imageHtml = imageSrc
    ? `<a class="message-embed-image-link" href="${url || imageSrc}" target="_blank" rel="noopener noreferrer"><img class="message-embed-image" src="${imageSrc}" alt="" loading="lazy" /></a>`
    : "";

  return `<div class="message-embed" style="border-left-color: ${color}">${thumbHtml}<div class="message-embed-body">${siteHtml}${titleHtml}${descriptionHtml}${imageHtml}</div></div>`;
}

export function messageMentionsUser(content: string, username: string): boolean {
  const pattern = new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return pattern.test(content);
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
