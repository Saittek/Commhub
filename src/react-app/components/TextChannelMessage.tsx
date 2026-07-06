import { useCallback, useRef } from "react";
import type { Message, ServerEmoji } from "../lib/api";
import {
  formatMessageTime,
  formatMessageTimeCompact,
  messageMentionsUser,
  QUICK_REACTIONS,
  renderEmbedHtml,
  renderMessageContent,
} from "../lib/message-format";
import UserAvatar from "./UserAvatar";
import { CopyIcon, PinIcon, ReplyIcon, ThreadIcon } from "./UiIcons";

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4"
      />
    </svg>
  );
}

function AddReactionIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" />
      <circle cx="15" cy="10" r="1.25" fill="currentColor" />
      <path
        d="M8.25 14.25c1.1 1.35 2.45 2.1 3.75 2.1s2.65-.75 3.75-2.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface TextChannelMessageProps {
  message: Message;
  grouped: boolean;
  inThread: boolean;
  threadCount: number;
  currentUserId: string;
  currentUsername?: string;
  authorColor?: string;
  authorRoleName?: string;
  currentDisplayName?: string;
  canManageMessages: boolean;
  serverEmojis?: ServerEmoji[];
  menuOpen: boolean;
  reactionPickerOpen: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onToggleMenu: () => void;
  onToggleReactionPicker: () => void;
  onReply: () => void;
  onOpenThread: () => void;
  onReport: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onReaction: (emoji: string) => void;
  onJumpToReply: (messageId: string) => void;
  variant?: "channel" | "dm";
  onAuthorClick?: (userId: string) => void;
}

function buildEmojiMap(emojis?: ServerEmoji[]): Record<string, string> | undefined {
  if (!emojis?.length) {
    return undefined;
  }
  const map: Record<string, string> = {};
  for (const emoji of emojis) {
    map[emoji.name.toLowerCase()] = emoji.url;
  }
  return map;
}

export default function TextChannelMessage({
  message,
  grouped,
  inThread,
  threadCount,
  currentUserId,
  currentUsername,
  authorColor,
  authorRoleName,
  currentDisplayName,
  canManageMessages,
  serverEmojis,
  menuOpen,
  reactionPickerOpen,
  editing,
  editDraft,
  onEditDraftChange,
  onToggleMenu,
  onToggleReactionPicker,
  onReply,
  onOpenThread,
  onReport,
  onEdit,
  onDelete,
  onTogglePin,
  onSaveEdit,
  onCancelEdit,
  onReaction,
  onJumpToReply,
  variant = "channel",
  onAuthorClick,
}: TextChannelMessageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const emojiMap = buildEmojiMap(serverEmojis);
  const isDm = variant === "dm";
  const isDeleted = Boolean(message.deletedAt);
  const mentionsMe =
    !isDeleted &&
    Boolean(currentUsername) &&
    message.author.id !== currentUserId &&
    messageMentionsUser(message.content, currentUsername!);
  const repliedToMe =
    !isDeleted &&
    Boolean(currentDisplayName || currentUsername) &&
    message.author.id !== currentUserId &&
    Boolean(message.replyTo) &&
    (message.replyTo!.authorName === currentDisplayName ||
      message.replyTo!.authorName === currentUsername);
  const highlightsMe = mentionsMe || repliedToMe;
  const canEdit = !isDeleted && message.author.id === currentUserId;
  const canDelete = !isDeleted && (message.author.id === currentUserId || canManageMessages);
  const showThreadBar = !inThread && threadCount > 0;

  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const spoiler = target.closest(".message-spoiler");
    if (spoiler instanceof HTMLElement) {
      spoiler.classList.add("revealed");
    }
  }, []);

  async function handleCopyText() {
    if (!message.content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // Clipboard unavailable.
    }
  }

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(message.id);
    } catch {
      // Clipboard unavailable.
    }
  }

  function renderHoverActions(compact = false) {
    if (isDeleted || editing) {
      return null;
    }

    return (
      <div className={`message-hover-actions${compact ? " message-hover-actions-compact" : ""}`}>
        <button type="button" className="message-hover-btn" title="Add reaction" onClick={onToggleReactionPicker}>
          <AddReactionIcon />
        </button>
        {!isDm && (
          <button type="button" className="message-hover-btn" title="Reply" onClick={onReply}>
            <ReplyIcon />
          </button>
        )}
        {!inThread && !isDm && (
          <button type="button" className="message-hover-btn" title="Create thread" onClick={onOpenThread}>
            <ThreadIcon />
          </button>
        )}
        {canManageMessages && !isDm && (
          <button type="button" className="message-hover-btn" title={message.pinned ? "Unpin" : "Pin"} onClick={onTogglePin}>
            <PinIcon />
          </button>
        )}
        <button
          type="button"
          className="message-hover-btn"
          title="More"
          aria-expanded={menuOpen}
          onClick={onToggleMenu}
        >
          <MoreIcon />
        </button>
      </div>
    );
  }

  return (
    <article
      id={`message-${message.id}`}
      className={`message-item${isDeleted ? " deleted" : ""}${grouped ? " grouped" : ""}${highlightsMe ? " mention-me" : ""}${message.replyTo ? " has-reply" : ""}`}
    >
      <div className="message-avatar-col" aria-hidden={grouped}>
        {!grouped ? (
          <UserAvatar
            username={message.author.displayName}
            avatarUrl={message.author.avatarUrl ?? null}
            className="message-avatar"
          />
        ) : (
          <span className="message-time-compact" title={formatMessageTime(message.createdAt)}>
            {formatMessageTimeCompact(message.createdAt)}
          </span>
        )}
      </div>

      <div className="message-body-col">
        {renderHoverActions(grouped)}

        {!grouped && (
          <header className="message-header">
            <div className="message-header-meta">
              <strong
                className="message-author-name"
                style={authorColor ? { color: authorColor } : undefined}
                onClick={
                  onAuthorClick
                    ? (event) => {
                        event.stopPropagation();
                        onAuthorClick(message.author.id);
                      }
                    : undefined
                }
                role={onAuthorClick ? "button" : undefined}
                tabIndex={onAuthorClick ? 0 : undefined}
              >
                {message.author.displayName}
              </strong>
              {authorRoleName && <span className="message-author-badge">{authorRoleName}</span>}
              <span className="message-time">{formatMessageTime(message.createdAt)}</span>
              {message.editedAt && <span className="message-edited">(edited)</span>}
              {message.pinned && (
                <span className="message-pinned" title="Pinned">
                  <PinIcon />
                </span>
              )}
            </div>
          </header>
        )}

        {message.replyTo && (
          <button
            type="button"
            className="message-reply-preview"
            onClick={() => onJumpToReply(message.replyTo!.id)}
          >
            <span className="message-reply-preview-connector" aria-hidden="true" />
            <UserAvatar
              username={message.replyTo.authorName}
              avatarUrl={null}
              size="reply"
              className="message-reply-preview-avatar"
            />
            <span className="message-reply-preview-meta">
              <span className="message-reply-preview-user">@{message.replyTo.authorName}</span>
              <span className="message-reply-preview-snippet">{message.replyTo.content}</span>
            </span>
          </button>
        )}

        {editing ? (
          <div className="message-edit-form">
            <textarea value={editDraft} onChange={(event) => onEditDraftChange(event.target.value)} rows={3} />
            <div className="message-edit-actions">
              <button type="button" onClick={onSaveEdit}>
                Save
              </button>
              <button type="button" className="channel-create-cancel" onClick={onCancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="message-body">
            {isDeleted ? (
              <p className="message-deleted-text">This message was deleted.</p>
            ) : (
              <>
                {message.content && (
                  <div
                    ref={contentRef}
                    className="message-content"
                    onClick={handleContentClick}
                    dangerouslySetInnerHTML={{
                      __html: renderMessageContent(message.content, emojiMap),
                    }}
                  />
                )}
                {message.embeds && message.embeds.length > 0 && (
                  <div className="message-embeds">
                    {message.embeds.map((embed, index) => (
                      <div
                        key={`${message.id}-embed-${index}`}
                        dangerouslySetInnerHTML={{ __html: renderEmbedHtml(embed) }}
                      />
                    ))}
                  </div>
                )}
                {message.sticker && (
                  <div className="message-sticker">
                    <img src={message.sticker.url} alt={message.sticker.name} />
                  </div>
                )}
                {message.attachments.length > 0 && (
                  <div className="message-attachments">
                    {message.attachments.map((attachment) =>
                      attachment.contentType.startsWith("image/") ? (
                        <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                          <img src={attachment.url} alt={attachment.filename} />
                        </a>
                      ) : (
                        <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                          {attachment.filename}
                        </a>
                      ),
                    )}
                  </div>
                )}
              </>
            )}

            {!isDeleted && (
              <div className="message-footer">
                {message.reactions.length > 0 && (
                  <div className="message-reactions">
                    {message.reactions.map((reaction) => (
                      <button
                        key={reaction.emoji}
                        type="button"
                        className={`message-reaction${reaction.me ? " me" : ""}`}
                        onClick={() => onReaction(reaction.emoji)}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    ))}
                  </div>
                )}
                <div className="message-reaction-picker-wrap">
                  {reactionPickerOpen && (
                    <div className="message-reaction-picker" role="menu">
                      {QUICK_REACTIONS.map((emoji) => (
                        <button key={emoji} type="button" role="menuitem" onClick={() => onReaction(emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {menuOpen && !isDeleted && !editing && (
          <div className="message-menu-dropdown message-menu-dropdown-floating" role="menu">
            <button type="button" role="menuitem" onClick={onReply}>
              Reply
            </button>
            {!inThread && !isDm && (
              <button type="button" role="menuitem" onClick={onOpenThread}>
                Create thread
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => void handleCopyText()}>
              <CopyIcon className="message-menu-icon" />
              Copy text
            </button>
            <button type="button" role="menuitem" onClick={() => void handleCopyId()}>
              Copy message ID
            </button>
            {!isDm && (
              <button type="button" role="menuitem" onClick={onReport}>
                Report
              </button>
            )}
            {canEdit && (
              <button type="button" role="menuitem" onClick={onEdit}>
                Edit
              </button>
            )}
            {canDelete && (
              <button type="button" role="menuitem" onClick={onDelete}>
                Delete
              </button>
            )}
            {canManageMessages && !isDm && (
              <button type="button" role="menuitem" onClick={onTogglePin}>
                {message.pinned ? "Unpin" : "Pin message"}
              </button>
            )}
          </div>
        )}

        {showThreadBar && (
          <button type="button" className="message-thread-bar" onClick={onOpenThread}>
            <ThreadIcon className="message-thread-bar-icon" />
            {threadCount} {threadCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
    </article>
  );
}
