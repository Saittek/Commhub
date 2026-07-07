import { FormEvent, useEffect, useState } from "react";
import {
  createForumComment,
  createForumPost,
  getForumComments,
  getForumPosts,
  type ForumComment,
  type ForumPost,
} from "../lib/api";
import UserAvatar from "./UserAvatar";

interface ForumChannelPanelProps {
  serverId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
}

export default function ForumChannelPanel({
  serverId,
  channelId,
  channelName,
}: ForumChannelPanelProps) {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [activePost, setActivePost] = useState<ForumPost | null>(null);
  const [comments, setComments] = useState<ForumComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function loadPosts() {
    setLoading(true);
    void getForumPosts(serverId, channelId)
      .then((response) => setPosts(response.posts))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load posts."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadPosts();
    setActivePost(null);
  }, [serverId, channelId]);

  useEffect(() => {
    if (!activePost) {
      setComments([]);
      return;
    }
    void getForumComments(serverId, channelId, activePost.id)
      .then((response) => setComments(response.comments))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load comments."));
  }, [activePost, serverId, channelId]);

  async function handleCreatePost(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await createForumPost(serverId, channelId, { title: title.trim(), content: content.trim() });
      setPosts((current) => [response.post, ...current]);
      setCreateOpen(false);
      setTitle("");
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create post.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComment(event: FormEvent) {
    event.preventDefault();
    if (!activePost || !commentDraft.trim()) return;
    setSubmitting(true);
    try {
      const response = await createForumComment(serverId, channelId, activePost.id, commentDraft.trim());
      setComments((current) => [...current, response.comment]);
      setCommentDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (activePost) {
    return (
      <div className="forum-channel-panel">
        <button type="button" className="text-channel-back" onClick={() => setActivePost(null)}>
          ← Back to posts
        </button>
        <article className="forum-post-detail">
          <h2>{activePost.title}</h2>
          <p className="forum-post-meta">
            {activePost.author.displayName} · {new Date(activePost.createdAt).toLocaleString()}
          </p>
          <p className="forum-post-body">{activePost.content}</p>
        </article>
        <section className="forum-comments">
          <h3>Comments ({comments.length})</h3>
          {comments.map((comment) => (
            <div key={comment.id} className="forum-comment">
              <strong>{comment.author.displayName}</strong>
              <span className="settings-muted"> · {new Date(comment.createdAt).toLocaleString()}</span>
              <p>{comment.content}</p>
            </div>
          ))}
          {!activePost.locked && (
            <form className="forum-comment-form" onSubmit={(e) => void handleComment(e)}>
              <textarea
                rows={3}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Write a comment..."
              />
              <button type="submit" className="primary-button" disabled={submitting || !commentDraft.trim()}>
                Comment
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="forum-channel-panel">
      <header className="forum-channel-header">
        <div>
          <h2>#{channelName}</h2>
          <p className="settings-muted">Forum channel — create posts and discuss in threads.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => setCreateOpen(true)}>
          New Post
        </button>
      </header>

      {error && <div className="settings-error">{error}</div>}
      {loading && <p className="settings-muted">Loading posts...</p>}

      {!loading && posts.length === 0 && (
        <p className="settings-muted app-modal-empty">No posts yet. Start the conversation.</p>
      )}

      <ul className="forum-post-list">
        {posts.map((post) => (
          <li key={post.id}>
            <button type="button" className="forum-post-card" onClick={() => setActivePost(post)}>
              <div className="forum-post-card-head">
                <UserAvatar
                  username={post.author.username}
                  avatarUrl={post.author.avatarUrl}
                  size="profile"
                />
                <div>
                  <strong>{post.title}</strong>
                  <p className="settings-muted">
                    {post.author.displayName} · {post.commentCount} comment{post.commentCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {post.content && <p className="forum-post-preview">{post.content.slice(0, 160)}</p>}
            </button>
          </li>
        ))}
      </ul>

      {createOpen && (
        <div className="settings-overlay" onClick={() => setCreateOpen(false)}>
          <div className="settings-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Create Post</h3>
            <form className="settings-form" onSubmit={(e) => void handleCreatePost(e)}>
              <label>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
              </label>
              <label>
                Content
                <textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} />
              </label>
              <div className="settings-actions">
                <button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={submitting}>
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
