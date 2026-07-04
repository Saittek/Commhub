import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addReaction,
  deleteMessage,
  editMessage,
  getChannelMessages,
  getMyPermissions,
  getPinnedMessages,
  getServerMembers,
  markChannelRead,
  pinMessage,
  removeReaction,
  sendMessage,
  unpinMessage,
  uploadAttachment,
  type Message,
  type RolePermissions,
  type ServerMember,
} from "../lib/api";
import { formatMessageTime, QUICK_REACTIONS, renderMessageContent } from "../lib/message-format";
import { TextChannelClient, type TextSocketEvent } from "../lib/text-client";

interface TextChannelPanelProps {
  serverId: string;
  channelId: string;
  channelName: string;
  currentUserId: string;
}

interface PendingUpload {
  id: string;
  filename: string;
  previewUrl?: string;
}

function hasPerm(permissions: RolePermissions | null, key: keyof RolePermissions): boolean {
  if (!permissions) {
    return false;
  }
  return permissions.administrator === true || permissions[key] === true;
}

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
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
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

export default function TextChannelPanel({
  serverId,
  channelId,
  channelName,
  currentUserId,
}: TextChannelPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [pins, setPins] = useState<Message[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<TextChannelClient | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottomRef = useRef(true);

  const activeThreadId = threadRoot?.id ?? null;

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) {
      return [];
    }
    const query = mentionQuery.toLowerCase();
    return members
      .filter(
        (member) =>
          member.username.toLowerCase().includes(query) ||
          member.displayName.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [members, mentionQuery]);

  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const index = current.findIndex((item) => item.id === message.id);
      if (index >= 0) {
        const next = [...current];
        next[index] = message;
        return next;
      }
      return [...current, message].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  const handleSocketEvent = useCallback(
    (event: TextSocketEvent) => {
      if (event.type === "message-create" || event.type === "message-update") {
        const message = event.message;
        if ((message.threadRootId ?? null) !== activeThreadId) {
          return;
        }
        upsertMessage(message);
        if (stickToBottomRef.current && message.author.id !== currentUserId) {
          requestAnimationFrame(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
          });
        }
      }

      if (event.type === "typing-start") {
        if ((event.threadRootId ?? null) !== activeThreadId || event.userId === currentUserId) {
          return;
        }
        setTypingUsers((current) =>
          current.includes(event.displayName) ? current : [...current, event.displayName],
        );
      }

      if (event.type === "typing-stop") {
        setTypingUsers((current) => current.filter((name) => name !== event.displayName));
      }
    },
    [activeThreadId, currentUserId, upsertMessage],
  );

  const loadMessages = useCallback(
    async (options?: { before?: string; replace?: boolean }) => {
      const response = await getChannelMessages(serverId, channelId, {
        before: options?.before,
        limit: 50,
        thread: activeThreadId,
      });

      setHasMore(response.messages.length === 50);

      if (options?.replace) {
        setMessages(response.messages);
      } else {
        setMessages((current) => {
          const merged = new Map(current.map((message) => [message.id, message]));
          for (const message of response.messages) {
            merged.set(message.id, message);
          }
          return [...merged.values()].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
      }

      const last = response.messages[response.messages.length - 1];
      if (last && !activeThreadId) {
        void markChannelRead(serverId, channelId, last.id);
      }
    },
    [serverId, channelId, activeThreadId],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      setError(null);
      setMessages([]);
      setReplyTo(null);
      setEditingId(null);
      setShowPins(false);
      setTypingUsers([]);

      try {
        const [perms, memberList] = await Promise.all([
          getMyPermissions(serverId),
          getServerMembers(serverId),
        ]);
        if (cancelled) {
          return;
        }
        setPermissions(perms.permissions);
        setMembers(memberList.members);
        await loadMessages({ replace: true });
        if (!cancelled) {
          requestAnimationFrame(() => {
            listRef.current?.scrollTo({ top: listRef.current?.scrollHeight ?? 0 });
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load messages.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [serverId, channelId, activeThreadId, loadMessages]);

  useEffect(() => {
    clientRef.current?.disconnect();
    const client = new TextChannelClient({
      serverId,
      channelId,
      onEvent: handleSocketEvent,
      onConnectionState: setConnected,
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [serverId, channelId, handleSocketEvent]);

  useEffect(() => {
    if (!showPins) {
      return;
    }
    void getPinnedMessages(serverId, channelId)
      .then((response) => setPins(response.pins))
      .catch(() => setPins([]));
  }, [showPins, serverId, channelId, messages]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (!target.closest(".message-menu") && !target.closest(".message-reaction-picker-wrap")) {
        setMenuMessageId(null);
        setReactionPickerMessageId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function closeMessageMenus() {
    setMenuMessageId(null);
    setReactionPickerMessageId(null);
  }

  function handleScroll() {
    const element = listRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;

    if (element.scrollTop < 80 && hasMore && !loadingOlder) {
      const oldest = messages[0];
      if (!oldest) {
        return;
      }
      setLoadingOlder(true);
      const previousHeight = element.scrollHeight;
      void loadMessages({ before: oldest.id })
        .then(() => {
          requestAnimationFrame(() => {
            if (listRef.current) {
              listRef.current.scrollTop = listRef.current.scrollHeight - previousHeight;
            }
          });
        })
        .finally(() => setLoadingOlder(false));
    }
  }

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const match = /(^|\s)@([a-zA-Z0-9_.-]*)$/.exec(before);
    setMentionQuery(match ? match[2] : null);
  }

  function insertMention(username: string) {
    setDraft((current) => current.replace(/@([a-zA-Z0-9_.-]*)$/, `@${username} `));
    setMentionQuery(null);
  }

  function notifyTyping() {
    clientRef.current?.sendTyping(true, activeThreadId);
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      clientRef.current?.sendTyping(false, activeThreadId);
    }, 2500);
  }

  async function handleSend() {
    const content = draft.trim();
    if (!content && pendingUploads.length === 0) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      const response = await sendMessage(serverId, channelId, {
        content,
        threadRootId: activeThreadId,
        replyToId: replyTo?.id ?? null,
        attachmentIds: pendingUploads.map((upload) => upload.id),
      });
      upsertMessage(response.message);
      setDraft("");
      setReplyTo(null);
      setMentionQuery(null);
      for (const upload of pendingUploads) {
        if (upload.previewUrl) {
          URL.revokeObjectURL(upload.previewUrl);
        }
      }
      setPendingUploads([]);
      clientRef.current?.sendTyping(false, activeThreadId);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current?.scrollHeight ?? 0, behavior: "smooth" });
      });
      if (!activeThreadId) {
        void markChannelRead(serverId, channelId, response.message.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveEdit(messageId: string) {
    const content = editDraft.trim();
    if (!content) {
      return;
    }
    try {
      const response = await editMessage(serverId, channelId, messageId, content);
      upsertMessage(response.message);
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not edit message.");
    }
  }

  async function handleDelete(messageId: string) {
    try {
      await deleteMessage(serverId, channelId, messageId);
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: "", deletedAt: new Date().toISOString() }
            : message,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete message.");
    }
  }

  async function handleReaction(message: Message, emoji: string) {
    const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
    try {
      const response = existing?.me
        ? await removeReaction(serverId, channelId, message.id, emoji)
        : await addReaction(serverId, channelId, message.id, emoji);
      if (response.message) {
        upsertMessage(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reaction.");
    }
  }

  async function handleTogglePin(message: Message) {
    try {
      const response = message.pinned
        ? await unpinMessage(serverId, channelId, message.id)
        : await pinMessage(serverId, channelId, message.id);
      if (response.message) {
        upsertMessage(response.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update pin.");
    }
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    for (const file of Array.from(files)) {
      try {
        const response = await uploadAttachment(serverId, channelId, file);
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setPendingUploads((current) => [
          ...current,
          { id: response.attachment.id, filename: response.attachment.filename, previewUrl },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not upload file.");
      }
    }
  }

  const canSend = hasPerm(permissions, "send_messages");
  const canManageMessages = hasPerm(permissions, "manage_messages");
  const canAttach = hasPerm(permissions, "attach_files");

  return (
    <div className="text-channel-panel">
      <div className="text-channel-toolbar">
        <div>
          <h2>{threadRoot ? `Thread: ${threadRoot.author.displayName}` : `#${channelName}`}</h2>
          {threadRoot && (
            <button type="button" className="text-channel-back" onClick={() => setThreadRoot(null)}>
              ← Back to #{channelName}
            </button>
          )}
        </div>
        <div className="text-channel-toolbar-actions">
          <span className={`text-channel-status ${connected ? "online" : ""}`}>
            {connected ? "Live" : "Reconnecting…"}
          </span>
          {!threadRoot && (
            <button type="button" className="icon-button" onClick={() => setShowPins((value) => !value)}>
              📌 Pins{pins.length ? ` (${pins.length})` : ""}
            </button>
          )}
        </div>
      </div>

      {error && <div className="settings-error text-channel-error">{error}</div>}

      <div className="text-channel-body">
        <div className="text-channel-messages" ref={listRef} onScroll={handleScroll}>
          {loadingOlder && <p className="text-channel-meta">Loading older messages…</p>}
          {loading && <p className="text-channel-meta">Loading messages…</p>}
          {!loading && messages.length === 0 && (
            <p className="text-channel-meta">
              {threadRoot
                ? "No replies yet. Start the conversation."
                : `This is the beginning of #${channelName}.`}
            </p>
          )}

          {messages.map((message) => {
            const isDeleted = Boolean(message.deletedAt);
            const isEditing = editingId === message.id;
            const canEdit = !isDeleted && message.author.id === currentUserId;
            const canDelete =
              !isDeleted && (message.author.id === currentUserId || canManageMessages);

            return (
              <article
                key={message.id}
                id={`message-${message.id}`}
                className={`message-item${isDeleted ? " deleted" : ""}`}
              >
                <header className="message-header">
                  <div className="message-header-meta">
                    <strong>{message.author.displayName}</strong>
                    <span className="message-time">{formatMessageTime(message.createdAt)}</span>
                    {message.editedAt && <span className="message-edited">(edited)</span>}
                    {message.pinned && <span className="message-pinned">📌</span>}
                  </div>
                  {!isDeleted && !isEditing && (
                    <div className="message-menu">
                      <button
                        type="button"
                        className="message-menu-trigger"
                        aria-label="Message options"
                        aria-expanded={menuMessageId === message.id}
                        onClick={() => {
                          setReactionPickerMessageId(null);
                          setMenuMessageId((current) =>
                            current === message.id ? null : message.id,
                          );
                        }}
                      >
                        <MoreIcon />
                      </button>
                      {menuMessageId === message.id && (
                        <div className="message-menu-dropdown" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setReplyTo(message);
                              closeMessageMenus();
                            }}
                          >
                            Reply
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setEditingId(message.id);
                                setEditDraft(message.content);
                                closeMessageMenus();
                              }}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void handleDelete(message.id);
                                closeMessageMenus();
                              }}
                            >
                              Delete
                            </button>
                          )}
                          {canManageMessages && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                void handleTogglePin(message);
                                closeMessageMenus();
                              }}
                            >
                              {message.pinned ? "Unpin" : "Pin"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </header>

                {message.replyTo && (
                  <div className="message-reply-preview">
                    Replying to <strong>{message.replyTo.authorName}</strong>: {message.replyTo.content}
                  </div>
                )}

                {isEditing ? (
                  <div className="message-edit-form">
                    <textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      rows={3}
                    />
                    <div className="message-edit-actions">
                      <button type="button" onClick={() => void handleSaveEdit(message.id)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="channel-create-cancel"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {isDeleted ? (
                      <p className="message-deleted-text">This message was deleted.</p>
                    ) : (
                      <>
                        {message.content && (
                          <div
                            className="message-content"
                            dangerouslySetInnerHTML={{
                              __html: renderMessageContent(message.content),
                            }}
                          />
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
                                  📎 {attachment.filename}
                                </a>
                              ),
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {!isDeleted && !isEditing && (
                      <div className="message-footer">
                        {message.reactions.length > 0 && (
                          <div className="message-reactions">
                            {message.reactions.map((reaction) => (
                              <button
                                key={reaction.emoji}
                                type="button"
                                className={`message-reaction${reaction.me ? " me" : ""}`}
                                onClick={() => void handleReaction(message, reaction.emoji)}
                              >
                                {reaction.emoji} {reaction.count}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="message-reaction-picker-wrap">
                          <button
                            type="button"
                            className="message-add-reaction"
                            aria-label="Add reaction"
                            aria-expanded={reactionPickerMessageId === message.id}
                            onClick={() => {
                              setMenuMessageId(null);
                              setReactionPickerMessageId((current) =>
                                current === message.id ? null : message.id,
                              );
                            }}
                          >
                            <AddReactionIcon />
                          </button>
                          {reactionPickerMessageId === message.id && (
                            <div className="message-reaction-picker" role="menu">
                              {QUICK_REACTIONS.map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    void handleReaction(message, emoji);
                                    closeMessageMenus();
                                  }}
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
        </div>

        {showPins && (
          <aside className="text-channel-pins">
            <h3>Pinned Messages</h3>
            {pins.length === 0 ? (
              <p className="text-channel-meta">No pinned messages.</p>
            ) : (
              pins.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className="text-channel-pin-item"
                  onClick={() => {
                    const element = document.getElementById(`message-${message.id}`);
                    element?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <strong>{message.author.displayName}</strong>
                  <span>{message.content || "Attachment"}</span>
                </button>
              ))
            )}
          </aside>
        )}
      </div>

      {typingUsers.length > 0 && (
        <p className="text-channel-typing">
          {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
        </p>
      )}

      {replyTo && (
        <div className="text-channel-reply-bar">
          Replying to <strong>{replyTo.author.displayName}</strong>
          <button type="button" onClick={() => setReplyTo(null)}>
            Cancel
          </button>
        </div>
      )}

      {canSend ? (
        <div className="text-channel-composer">
          {pendingUploads.length > 0 && (
            <div className="text-channel-uploads">
              {pendingUploads.map((upload) => (
                <div key={upload.id} className="text-channel-upload-chip">
                  {upload.previewUrl ? (
                    <img src={upload.previewUrl} alt={upload.filename} />
                  ) : (
                    <span>{upload.filename}</span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setPendingUploads((current) => current.filter((item) => item.id !== upload.id))
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {mentionCandidates.length > 0 && (
            <div className="mention-autocomplete">
              {mentionCandidates.map((member) => (
                <button key={member.userId} type="button" onClick={() => insertMention(member.username)}>
                  @{member.username} <span>{member.displayName}</span>
                </button>
              ))}
            </div>
          )}

          <div className="text-channel-composer-row">
            {canAttach && (
              <label className="text-channel-attach">
                📎
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                  onChange={(event) => void handleFileSelect(event.target.files)}
                />
              </label>
            )}
            <textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                updateMentionState(event.target.value, event.target.selectionStart);
                notifyTyping();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Message #${threadRoot ? "thread" : channelName}`}
              rows={1}
            />
            <button type="button" disabled={sending} onClick={() => void handleSend()}>
              Send
            </button>
          </div>
          <p className="text-channel-hint">Shift+Enter for a new line. **bold**, *italic*, `code`, @mentions.</p>
        </div>
      ) : (
        <p className="text-channel-readonly">You do not have permission to send messages in this channel.</p>
      )}
    </div>
  );
}
