const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])/g;
const CODE_PATTERN = /`([^`]+)`/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const ITALIC_PATTERN = /\*([^*]+)\*/g;
const MENTION_PATTERN = /(^|[\s>])@([a-zA-Z0-9_.-]{2,32})\b/g;
const EVERYONE_PATTERN = /@(everyone|here)\b/gi;

export function formatMessageTime(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderMessageContent(content: string): string {
  let html = escapeHtml(content);

  html = html.replace(CODE_PATTERN, "<code>$1</code>");
  html = html.replace(BOLD_PATTERN, "<strong>$1</strong>");
  html = html.replace(ITALIC_PATTERN, "<em>$1</em>");
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

  return html.replace(/\n/g, "<br />");
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
