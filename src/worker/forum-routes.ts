import type { Hono } from "hono";
import { getServerChannel } from "./lib/channels";
import { mapForumComment, mapForumPost } from "./lib/forum";
import { requireServerMember } from "./lib/server-access";
import { requireUser } from "./lib/session";
import { memberHasPermission } from "./lib/user-permissions";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function newId(): string {
  return crypto.randomUUID();
}

export function registerForumRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/api/servers/:serverId/channels/:channelId/forum/posts", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const channel = await getServerChannel(c.env.DB, server.id, c.req.param("channelId"));
    if (!channel || channel.type !== "forum") {
      return jsonError("Forum channel not found.", 404);
    }

    const rows = await c.env.DB.prepare(
      `SELECT fp.*, u.username, u.display_name, u.avatar_url,
              (SELECT COUNT(*) FROM forum_post_comments c WHERE c.post_id = fp.id) AS comment_count
       FROM forum_posts fp
       INNER JOIN users u ON u.id = fp.author_id
       WHERE fp.channel_id = ?
       ORDER BY fp.pinned DESC, fp.created_at DESC
       LIMIT 50`,
    )
      .bind(channel.id)
      .all<
        {
          id: string;
          channel_id: string;
          server_id: string;
          author_id: string;
          title: string;
          content: string;
          pinned: number;
          locked: number;
          created_at: string;
          username: string;
          display_name: string;
          avatar_url: string | null;
          comment_count: number;
        }
      >();

    return c.json({
      posts: (rows.results ?? []).map((row) =>
        mapForumPost(
          row,
          { username: row.username, display_name: row.display_name, avatar_url: row.avatar_url },
          row.comment_count,
        ),
      ),
    });
  });

  app.post("/api/servers/:serverId/channels/:channelId/forum/posts", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const channel = await getServerChannel(c.env.DB, server.id, c.req.param("channelId"));
    if (!channel || channel.type !== "forum") {
      return jsonError("Forum channel not found.", 404);
    }

    const canPost = await memberHasPermission(
      c.env.DB,
      server.id,
      user.sub,
      server.owner_id,
      "send_messages",
    );
    if (!canPost) {
      return jsonError("You do not have permission to create forum posts.", 403);
    }

    const body = (await c.req.json()) as { title?: string; content?: string };
    const title = body.title?.trim() ?? "";
    const content = body.content?.trim() ?? "";
    if (title.length < 2 || title.length > 200) {
      return jsonError("Post title must be 2-200 characters.", 400);
    }
    if (content.length > 4000) {
      return jsonError("Post content must be 4000 characters or fewer.", 400);
    }

    const postId = newId();
    await c.env.DB.prepare(
      `INSERT INTO forum_posts (id, channel_id, server_id, author_id, title, content)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(postId, channel.id, server.id, user.sub, title, content)
      .run();

    const profile = await c.env.DB.prepare(
      "SELECT username, display_name, avatar_url FROM users WHERE id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ username: string; display_name: string; avatar_url: string | null }>();

    return c.json(
      {
        post: mapForumPost(
          {
            id: postId,
            channel_id: channel.id,
            server_id: server.id,
            author_id: user.sub,
            title,
            content,
            pinned: 0,
            locked: 0,
            created_at: new Date().toISOString(),
          },
          profile ?? { username: "", display_name: "", avatar_url: null },
          0,
        ),
      },
      201,
    );
  });

  app.get("/api/servers/:serverId/channels/:channelId/forum/posts/:postId/comments", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const rows = await c.env.DB.prepare(
      `SELECT fc.*, u.username, u.display_name
       FROM forum_post_comments fc
       INNER JOIN users u ON u.id = fc.author_id
       WHERE fc.post_id = ?
       ORDER BY fc.created_at ASC`,
    )
      .bind(c.req.param("postId"))
      .all<{
        id: string;
        post_id: string;
        author_id: string;
        content: string;
        created_at: string;
        username: string;
        display_name: string;
      }>();

    return c.json({
      comments: (rows.results ?? []).map((row) =>
        mapForumComment(row, { username: row.username, display_name: row.display_name }),
      ),
    });
  });

  app.post("/api/servers/:serverId/channels/:channelId/forum/posts/:postId/comments", async (c) => {
    const user = await requireUser(c);
    if (user instanceof Response) return user;

    const server = await requireServerMember(c, user, c.req.param("serverId"));
    if (server instanceof Response) return server;

    const post = await c.env.DB.prepare(
      "SELECT locked FROM forum_posts WHERE id = ? AND server_id = ? LIMIT 1",
    )
      .bind(c.req.param("postId"), server.id)
      .first<{ locked: number }>();

    if (!post) {
      return jsonError("Post not found.", 404);
    }
    if (post.locked === 1) {
      return jsonError("This post is locked.", 403);
    }

    const body = (await c.req.json()) as { content?: string };
    const content = body.content?.trim() ?? "";
    if (!content || content.length > 2000) {
      return jsonError("Comment must be 1-2000 characters.", 400);
    }

    const commentId = newId();
    await c.env.DB.prepare(
      "INSERT INTO forum_post_comments (id, post_id, author_id, content) VALUES (?, ?, ?, ?)",
    )
      .bind(commentId, c.req.param("postId"), user.sub, content)
      .run();

    const profile = await c.env.DB.prepare(
      "SELECT username, display_name FROM users WHERE id = ? LIMIT 1",
    )
      .bind(user.sub)
      .first<{ username: string; display_name: string }>();

    return c.json(
      {
        comment: mapForumComment(
          {
            id: commentId,
            post_id: c.req.param("postId"),
            author_id: user.sub,
            content,
            created_at: new Date().toISOString(),
          },
          profile ?? { username: "", display_name: "" },
        ),
      },
      201,
    );
  });
}
