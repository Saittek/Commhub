export interface ForumPostRow {
  id: string;
  channel_id: string;
  server_id: string;
  author_id: string;
  title: string;
  content: string;
  pinned: number;
  locked: number;
  created_at: string;
}

export interface ForumCommentRow {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export function mapForumPost(
  row: ForumPostRow,
  author: { username: string; display_name: string; avatar_url?: string | null },
  commentCount: number,
) {
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    title: row.title,
    content: row.content,
    pinned: row.pinned === 1,
    locked: row.locked === 1,
    createdAt: row.created_at,
    commentCount,
    author: {
      id: row.author_id,
      username: author.username,
      displayName: author.display_name,
      avatarUrl: author.avatar_url ? `/api/auth/avatars/${row.author_id}` : null,
    },
  };
}

export function mapForumComment(
  row: ForumCommentRow,
  author: { username: string; display_name: string },
) {
  return {
    id: row.id,
    postId: row.post_id,
    content: row.content,
    createdAt: row.created_at,
    author: {
      id: row.author_id,
      username: author.username,
      displayName: author.display_name,
    },
  };
}
