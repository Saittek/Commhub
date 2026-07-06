import type { DmMessage, Message } from "./api";
import { isDifferentDay } from "./message-format";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function shouldGroupWithPrevious(prev: Message | undefined, curr: Message): boolean {
  if (!prev || prev.deletedAt || curr.deletedAt) {
    return false;
  }
  if (isDifferentDay(prev.createdAt, curr.createdAt)) {
    return false;
  }
  if (prev.author.id !== curr.author.id) {
    return false;
  }
  const prevTime = new Date(prev.createdAt).getTime();
  const currTime = new Date(curr.createdAt).getTime();
  return currTime - prevTime < GROUP_WINDOW_MS;
}

export function dmToMessage(dm: DmMessage): Message {
  return {
    id: dm.id,
    channelId: dm.channelId,
    serverId: "",
    author: {
      id: dm.author.id,
      username: dm.author.username,
      displayName: dm.author.displayName,
      avatarUrl: dm.author.avatarUrl ?? null,
    },
    content: dm.content,
    threadRootId: null,
    replyToId: null,
    replyTo: null,
    createdAt: dm.createdAt,
    editedAt: dm.editedAt,
    deletedAt: null,
    pinned: false,
    attachments: (dm.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      url: attachment.url,
    })),
    reactions: (dm.reactions ?? []).map((reaction) => ({
      emoji: reaction.emoji,
      count: reaction.count,
      me: reaction.me,
      userIds: [],
    })),
    embeds: [],
    threadArchived: false,
    threadLocked: false,
  };
}
