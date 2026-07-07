import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addReaction,
  deleteMessage,
  editMessage,
  getChannelMessages,
  getMyPermissions,
  getPinnedMessages,
  getServerEmojis,
  getServerStickers,
  getServerMembers,
  getThreadCounts,
  markChannelRead,
  pinMessage,
  removeReaction,
  reportContent,
  searchMessages,
  sendMessage,
  unpinMessage,
  updateThreadSettings,
  uploadAttachment,
  type Message,
  type MessageResponse,
  type RolePermissions,
  type SearchResult,
  type ServerEmoji,
  type ServerSticker,
  type ServerMember,
} from "../lib/api";
import {
  formatDateDivider,
  isDifferentDay,
  messageMentionsUser,
} from "../lib/message-format";
import { shouldGroupWithPrevious } from "../lib/message-utils";
import { TextChannelClient, type TextSocketEvent } from "../lib/text-client";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import EmojiPicker from "./EmojiPicker";
import TextChannelMessage from "./TextChannelMessage";
import UserProfilePopover from "./UserProfilePopover";
import { ArrowDownIcon, AttachIcon, HashIcon, PinIcon, ReplyIcon, SearchIcon, SendIcon } from "./UiIcons";

interface TextChannelPanelProps {
  serverId: string;
  channelId: string;
  channelName: string;
  channelTopic?: string | null;
  slowModeSeconds?: number;
  currentUserId: string;
  embedded?: boolean;
  onOpenDm?: (userId: string) => void;
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


export default function TextChannelPanel({
  serverId,
  channelId,
  channelName,
  channelTopic,
  slowModeSeconds = 0,
  currentUserId,
  embedded = false,
  onOpenDm,
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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [threadCounts, setThreadCounts] = useState<Record<string, number>>({});
  const [showJumpToPresent, setShowJumpToPresent] = useState(false);
  const [serverEmojis, setServerEmojis] = useState<ServerEmoji[]>([]);
  const [serverStickers, setServerStickers] = useState<ServerSticker[]>([]);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [threadLocked, setThreadLocked] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<{
    userId: string;
    rect: DOMRect;
  } | null>(null);

  const { user } = useAuth();
  const { pushNotification } = useNotifications();
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<TextChannelClient | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickToBottomRef = useRef(true);

  const activeThreadId = threadRoot?.id ?? null;

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const response = await searchMessages(serverId, searchQuery.trim());
      setSearchResults(response.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleReport(message: Message) {
    const reason = window.prompt("Why are you reporting this message?");
    if (!reason?.trim()) return;
    try {
      await reportContent(serverId, {
        targetType: "message",
        targetId: message.id,
        reason: reason.trim(),
      });
      setReportNotice("Report submitted. Moderators will review it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit report.");
    }
  }

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

  const authorMetaByUserId = useMemo(() => {
    const map = new Map<string, { color?: string; roleName?: string }>();
    for (const member of members) {
      if (member.displayRole) {
        map.set(member.userId, {
          color: member.displayRole.color,
          roleName: member.displayRole.name,
        });
      }
    }
    return map;
  }, [members]);

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
        const msgThread = message.threadRootId ?? null;

        if (event.type === "message-create" && message.author.id !== currentUserId) {
          const wrongContext = msgThread !== activeThreadId;
          const isMention = user ? messageMentionsUser(message.content, user.username) : false;
          if (wrongContext || isMention) {
            const preview = message.content.slice(0, 120) || "Attachment";
            pushNotification({
              title: isMention
                ? `${message.author.displayName} mentioned you`
                : `${message.author.displayName} in #${channelName}`,
              body: preview,
              type: isMention ? "mention" : "message",
              channelId,
              serverId,
            });
          }
        }

        if (msgThread !== activeThreadId) {
          if (event.type === "message-create" && msgThread && !activeThreadId) {
            setThreadCounts((current) => ({
              ...current,
              [msgThread]: (current[msgThread] ?? 0) + 1,
            }));
          }
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
    [
      activeThreadId,
      channelId,
      channelName,
      currentUserId,
      pushNotification,
      serverId,
      upsertMessage,
      user,
    ],
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
        const [perms, memberList, threads] = await Promise.all([
          getMyPermissions(serverId),
          getServerMembers(serverId),
          !activeThreadId ? getThreadCounts(serverId, channelId) : Promise.resolve({ counts: {} }),
        ]);
        if (cancelled) {
          return;
        }
        setPermissions(perms.permissions);
        setMembers(memberList.members);
        setThreadCounts(threads.counts);
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
    void getServerEmojis(serverId)
      .then((response) => setServerEmojis(response.emojis))
      .catch(() => setServerEmojis([]));
    void getServerStickers(serverId)
      .then((response) => setServerStickers(response.stickers))
      .catch(() => setServerStickers([]));
  }, [serverId]);

  async function handleSendSticker(stickerId: string) {
    setSending(true);
    setError(null);
    try {
      const response = await sendMessage(serverId, channelId, {
        content: "",
        threadRootId: activeThreadId,
        stickerId,
      });
      upsertMessage(response.message);
      setStickerPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sticker.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    setThreadLocked(false);
  }, [threadRoot?.id]);

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
      if (
        !target.closest(".message-hover-btn") &&
        !target.closest(".message-menu-dropdown-floating") &&
        !target.closest(".message-reaction-picker-wrap") &&
        !target.closest(".emoji-picker-wrap")
      ) {
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
    setShowJumpToPresent(distanceFromBottom >= 120);

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

  function scrollToBottom(smooth = true) {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    stickToBottomRef.current = true;
    setShowJumpToPresent(false);
  }

  function scrollToMessage(messageId: string) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openThread(message: Message) {
    setThreadRoot(message);
    setThreadLocked(message.threadLocked ?? false);
    closeMessageMenus();
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

  function insertEmoji(value: string) {
    setDraft((current) => `${current}${value}`);
    composerRef.current?.focus();
  }

  async function handleArchiveThread() {
    if (!threadRoot) return;
    try {
      await updateThreadSettings(serverId, channelId, threadRoot.id, { archived: true });
      setThreadRoot(null);
      setThreadLocked(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive thread.");
    }
  }

  async function handleToggleThreadLock() {
    if (!threadRoot) return;
    const next = !threadLocked;
    try {
      await updateThreadSettings(serverId, channelId, threadRoot.id, { locked: next });
      setThreadLocked(next);
      setThreadRoot((current) =>
        current ? { ...current, threadLocked: next } : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update thread.");
    }
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
      const response = (await sendMessage(serverId, channelId, {
        content,
        threadRootId: activeThreadId,
        replyToId: replyTo?.id ?? null,
        attachmentIds: pendingUploads.map((upload) => upload.id),
      })) as MessageResponse | { slashResponse: boolean; content: string };

      if ("slashResponse" in response && response.slashResponse) {
        upsertMessage({
          id: `slash-${Date.now()}`,
          channelId,
          serverId,
          author: { id: "slash", username: "command", displayName: "Slash Command" },
          content: response.content,
          threadRootId: activeThreadId,
          replyToId: null,
          replyTo: null,
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
          pinned: false,
          attachments: [],
          reactions: [],
          embeds: [],
          threadArchived: false,
          threadLocked: false,
        });
      } else {
        upsertMessage((response as MessageResponse).message);
        if (activeThreadId) {
          setThreadCounts((current) => ({
            ...current,
            [activeThreadId]: (current[activeThreadId] ?? 0) + 1,
          }));
        }
        if (!activeThreadId) {
          void markChannelRead(serverId, channelId, (response as MessageResponse).message.id);
        }
      }
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
    <div className={`text-channel-panel${embedded ? " text-channel-panel--embedded" : ""}`}>
      {(!embedded || threadRoot) && (
      <div className="text-channel-toolbar">
        {threadRoot ? (
          <div className="text-channel-thread-header">
            <button type="button" className="text-channel-back" onClick={() => setThreadRoot(null)}>
              ← Back
            </button>
            <div>
              <h2>Thread{threadLocked ? " (locked)" : ""}</h2>
              <p>
                {threadRoot.author.displayName}: {threadRoot.content || "Attachment"}
              </p>
            </div>
            {canManageMessages && (
              <div className="text-channel-thread-actions">
                <button
                  type="button"
                  className="icon-button"
                  title={threadLocked ? "Unlock thread" : "Lock thread"}
                  onClick={handleToggleThreadLock}
                >
                  {threadLocked ? "Unlock" : "Lock"}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="Archive thread"
                  onClick={handleArchiveThread}
                >
                  Archive
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-channel-toolbar-title">
            <HashIcon className="text-channel-toolbar-hash" />
            <span>{channelName}</span>
            {slowModeSeconds > 0 && (
              <span className="text-channel-slowmode" title="Slow mode enabled">
                {slowModeSeconds}s
              </span>
            )}
          </div>
        )}
        <div className="text-channel-toolbar-actions">
          <span className={`text-channel-status ${connected ? "online" : ""}`} title={connected ? "Connected" : "Reconnecting"}>
            <span className="text-channel-status-dot" />
          </span>
          {!threadRoot && (
            <button
              type="button"
              className={`icon-button${showSearch ? " active" : ""}`}
              onClick={() => setShowSearch((v) => !v)}
              title="Search"
              aria-label="Search messages"
            >
              <SearchIcon />
            </button>
          )}
          {!threadRoot && (
            <button
              type="button"
              className={`icon-button icon-button-badge${showPins ? " active" : ""}`}
              onClick={() => setShowPins((value) => !value)}
              title="Pinned messages"
              aria-label={`Pinned messages${pins.length ? `, ${pins.length}` : ""}`}
            >
              <PinIcon />
              {pins.length > 0 && <span className="icon-button-count">{pins.length}</span>}
            </button>
          )}
        </div>
      </div>
      )}

      {error && <div className="settings-error text-channel-error">{error}</div>}
      {reportNotice && <div className="settings-success text-channel-notice">{reportNotice}</div>}

      {showSearch && !threadRoot && (
        <div className="message-search-panel">
          <SearchIcon className="message-search-icon" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search in #${channelName}`}
            onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
          />
          <button
            type="button"
            className="icon-button"
            onClick={() => void handleSearch()}
            disabled={searching}
            title="Search"
            aria-label="Search"
          >
            <SearchIcon />
          </button>
          {searchResults.length > 0 && (
            <ul className="message-search-results">
              {searchResults.map((result) => (
                <li key={result.messageId}>
                  <button type="button" onClick={() => scrollToMessage(result.messageId)}>
                    <strong>#{result.channelName}</strong>
                    <span>
                      {result.author.displayName}: {result.content}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="text-channel-body">
        <div className="text-channel-messages-wrap">
          <div className="text-channel-messages" ref={listRef} onScroll={handleScroll}>
            {loadingOlder && <p className="text-channel-meta">Loading older messages…</p>}

            {!threadRoot && !loading && (
              <div className="text-channel-start">
                <div className="text-channel-start-icon" aria-hidden="true">
                  <HashIcon />
                </div>
                <h3>Welcome to #{channelName}!</h3>
                {channelTopic && <p className="text-channel-start-topic">{channelTopic}</p>}
                <p className="text-channel-start-hint">
                  This is the start of the #{channelName} channel.
                </p>
              </div>
            )}

            {threadRoot && !loading && messages.length === 0 && (
              <div className="text-channel-start text-channel-start-compact">
                <h3>Thread starter</h3>
                <p>{threadRoot.content || "Attachment"}</p>
              </div>
            )}

            {loading && <p className="text-channel-meta">Loading messages…</p>}

            {messages.map((message, index) => {
              const prev = index > 0 ? messages[index - 1] : undefined;
              const grouped = shouldGroupWithPrevious(prev, message);
              const showDateDivider = !prev || isDifferentDay(prev.createdAt, message.createdAt);
              const authorMeta = authorMetaByUserId.get(message.author.id);

              return (
                <Fragment key={message.id}>
                  {showDateDivider && (
                    <div className="message-date-divider">
                      <span>{formatDateDivider(message.createdAt)}</span>
                    </div>
                  )}
                  <TextChannelMessage
                    message={message}
                    grouped={grouped}
                    inThread={Boolean(threadRoot)}
                    threadCount={threadCounts[message.id] ?? 0}
                    currentUserId={currentUserId}
                    currentUsername={user?.username}
                    currentDisplayName={user?.displayName}
                    authorColor={authorMeta?.color}
                    authorRoleName={authorMeta?.roleName}
                    canManageMessages={canManageMessages}
                    serverEmojis={serverEmojis}
                    menuOpen={menuMessageId === message.id}
                    reactionPickerOpen={reactionPickerMessageId === message.id}
                    editing={editingId === message.id}
                    editDraft={editDraft}
                    onEditDraftChange={setEditDraft}
                    onToggleMenu={() => {
                      setReactionPickerMessageId(null);
                      setMenuMessageId((current) => (current === message.id ? null : message.id));
                    }}
                    onToggleReactionPicker={() => {
                      setMenuMessageId(null);
                      setReactionPickerMessageId((current) =>
                        current === message.id ? null : message.id,
                      );
                    }}
                    onReply={() => {
                      setReplyTo(message);
                      closeMessageMenus();
                    }}
                    onOpenThread={() => openThread(message)}
                    onReport={() => void handleReport(message)}
                    onEdit={() => {
                      setEditingId(message.id);
                      setEditDraft(message.content);
                      closeMessageMenus();
                    }}
                    onDelete={() => void handleDelete(message.id)}
                    onTogglePin={() => void handleTogglePin(message)}
                    onSaveEdit={() => void handleSaveEdit(message.id)}
                    onCancelEdit={() => {
                      setEditingId(null);
                      setEditDraft("");
                    }}
                    onReaction={(emoji) => {
                      void handleReaction(message, emoji);
                      closeMessageMenus();
                    }}
                    onJumpToReply={scrollToMessage}
                    onAuthorClick={(userId) => {
                      const el = document.getElementById(`message-${message.id}`);
                      const nameEl = el?.querySelector(".message-author-name");
                      if (nameEl) {
                        setProfileAnchor({ userId, rect: nameEl.getBoundingClientRect() });
                      }
                    }}
                  />
                </Fragment>
              );
            })}
          </div>

          {showJumpToPresent && (
            <button type="button" className="jump-to-present" onClick={() => scrollToBottom()}>
              <ArrowDownIcon />
              Jump to present
            </button>
          )}
        </div>

        {showPins && !embedded && (
          <aside className="text-channel-pins">
            <header className="text-channel-pins-header">
              <PinIcon className="text-channel-pins-header-icon" />
              <span>Pinned</span>
            </header>
            {pins.length === 0 ? (
              <p className="text-channel-meta">No pinned messages yet.</p>
            ) : (
              pins.map((message) => (
                <button
                  key={message.id}
                  type="button"
                  className="text-channel-pin-item"
                  onClick={() => scrollToMessage(message.id)}
                >
                  <strong>{message.author.displayName}</strong>
                  <span>{message.content || "Attachment"}</span>
                </button>
              ))
            )}
          </aside>
        )}
      </div>

      <div className="text-channel-footer">
        {typingUsers.length > 0 && (
          <div className="text-channel-typing">
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <strong>{typingUsers.join(", ")}</strong> {typingUsers.length === 1 ? "is" : "are"} typing
            </span>
          </div>
        )}

        {replyTo && (
          <div className="text-channel-reply-bar">
            <ReplyIcon className="text-channel-reply-bar-icon" />
            <div className="text-channel-reply-bar-text">
              Replying to <strong>{replyTo.author.displayName}</strong>
              <span>{replyTo.content}</span>
            </div>
            <button type="button" className="text-channel-reply-bar-close" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              ×
            </button>
          </div>
        )}

        {canSend && !threadLocked ? (
          <div className="text-channel-composer-wrap">
            <div className="text-channel-composer-card">
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
                      <span className="mention-autocomplete-user">@{member.username}</span>
                      <span>{member.displayName}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="text-channel-composer-inner">
                {canAttach && (
                  <label className="text-channel-attach" title="Upload a file">
                    <AttachIcon />
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain"
                      onChange={(event) => void handleFileSelect(event.target.files)}
                    />
                  </label>
                )}
                <EmojiPicker
                  emojis={serverEmojis}
                  onSelect={insertEmoji}
                  disabled={sending}
                />
                {serverStickers.length > 0 && (
                  <div className="sticker-picker-wrap">
                    <button
                      type="button"
                      className="emoji-picker-trigger"
                      title="Send sticker"
                      onClick={() => setStickerPickerOpen((open) => !open)}
                    >
                      ST
                    </button>
                    {stickerPickerOpen && (
                      <div className="sticker-picker-menu">
                        {serverStickers.map((sticker) => (
                          <button
                            key={sticker.id}
                            type="button"
                            className="sticker-picker-item"
                            onClick={() => void handleSendSticker(sticker.id)}
                          >
                            <img src={sticker.url} alt={sticker.name} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <textarea
                  ref={composerRef}
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
                <button
                  type="button"
                  className="text-channel-send"
                  disabled={sending || (!draft.trim() && pendingUploads.length === 0)}
                  onClick={() => void handleSend()}
                  title="Send message"
                  aria-label="Send message"
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        ) : threadLocked ? (
          <p className="text-channel-readonly">This thread is locked. You cannot send messages.</p>
        ) : (
          <p className="text-channel-readonly">You do not have permission to send messages in this channel.</p>
        )}
      </div>

      {profileAnchor && (
        <UserProfilePopover
          userId={profileAnchor.userId}
          serverId={serverId}
          anchorRect={profileAnchor.rect}
          onClose={() => setProfileAnchor(null)}
          onMessage={
            profileAnchor.userId === currentUserId ? undefined : onOpenDm
          }
        />
      )}
    </div>
  );
}
