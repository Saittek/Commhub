import { FormEvent, useEffect, useState } from "react";
import { searchMessages, type ForumSearchResult, type SearchResult } from "../lib/api";

interface GlobalSearchModalProps {
  serverId: string;
  open: boolean;
  onClose: () => void;
  onSelectMessage: (channelId: string, messageId: string) => void;
  onSelectForumPost?: (channelId: string) => void;
}

export default function GlobalSearchModal({
  serverId,
  open,
  onClose,
  onSelectMessage,
  onSelectForumPost,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [forumPosts, setForumPosts] = useState<ForumSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setForumPosts([]);
      setError(null);
    }
  }, [open]);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await searchMessages(serverId, q);
      setResults(response.results);
      setForumPosts(response.forumPosts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal global-search-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <header className="settings-modal-header">
          <h2>Search Server</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form className="global-search-form" onSubmit={(e) => void handleSearch(e)}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages and forum posts..."
            autoFocus
          />
          <button type="submit" className="primary-button" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        {error && <div className="settings-error">{error}</div>}
        {results.length > 0 && (
          <>
            <h3 className="global-search-section-title">Messages</h3>
            <ul className="message-search-results">
              {results.map((result) => (
                <li key={result.messageId}>
                  <button
                    type="button"
                    className="message-search-result"
                    onClick={() => {
                      onSelectMessage(result.channelId, result.messageId);
                      onClose();
                    }}
                  >
                    <span className="message-search-result-channel">#{result.channelName}</span>
                    <span className="message-search-result-author">{result.author.displayName}</span>
                    <span className="message-search-result-content">{result.content}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {forumPosts.length > 0 && (
          <>
            <h3 className="global-search-section-title">Forum Posts</h3>
            <ul className="message-search-results">
              {forumPosts.map((post) => (
                <li key={post.postId}>
                  <button
                    type="button"
                    className="message-search-result"
                    onClick={() => {
                      onSelectForumPost?.(post.channelId);
                      onClose();
                    }}
                  >
                    <span className="message-search-result-channel">#{post.channelName}</span>
                    <span className="message-search-result-author">{post.author.displayName}</span>
                    <span className="message-search-result-content">{post.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
