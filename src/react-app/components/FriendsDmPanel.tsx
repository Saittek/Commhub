import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import {
  acceptFriendRequest,
  createGroupDm,
  declineFriendRequest,
  deleteDmMessage,
  editDmMessage,
  addDmReaction,
  getDmChannels,
  getDmMessages,
  getFriends,
  openDm,
  removeDmReaction,
  removeFriend,
  sendDmMessage,
  sendFriendRequest,
  uploadDmAttachment,
  type DmChannel,
  type DmMessage,
  type FriendRequest,
  type FriendUser,
  type Message,
} from "../lib/api";
import { formatDateDivider, isDifferentDay } from "../lib/message-format";
import { dmToMessage, shouldGroupWithPrevious } from "../lib/message-utils";
import { DmChannelClient } from "../lib/dm-client";
import TextChannelMessage from "./TextChannelMessage";
import VoiceInviteMessage from "./VoiceInviteMessage";
import UserAvatar from "./UserAvatar";
import { isVoiceInviteMessage, parseVoiceInvite, stripVoiceInviteMarker } from "../lib/voice-invite";
import { AttachIcon } from "./UiIcons";

function dmTitle(channel: DmChannel): string {
  if (channel.name?.trim()) return channel.name;
  if (channel.participants.length === 1) return channel.participants[0].displayName;
  if (channel.participants.length > 1) {
    return channel.participants.map((p) => p.displayName).join(", ");
  }
  return "Direct Message";
}

interface FriendsDmPanelProps {
  openDmUserId?: string | null;
  onOpenDmHandled?: () => void;
  onJoinVoiceInvite?: (serverId: string, channelId: string) => void;
  joiningVoiceInvite?: boolean;
}

export default function FriendsDmPanel({
  openDmUserId = null,
  onOpenDmHandled,
  onJoinVoiceInvite,
  joiningVoiceInvite = false,
}: FriendsDmPanelProps) {
  const { user } = useAuth();
  const { pushNotification } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [dmChannels, setDmChannels] = useState<DmChannel[]>([]);
  const [activeDmId, setActiveDmId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"friends" | "dms">("friends");
  const [pendingAttachmentIds, setPendingAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const channelMessages: Message[] = messages.map(dmToMessage);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [friendsData, dmsData] = await Promise.all([getFriends(), getDmChannels()]);
      setFriends(friendsData.friends);
      setIncoming(friendsData.incoming);
      setDmChannels(dmsData.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load friends.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!openDmUserId) return;
    void handleOpenDm(openDmUserId).finally(() => onOpenDmHandled?.());
  }, [openDmUserId]);

  useEffect(() => {
    if (!activeDmId) {
      setMessages([]);
      knownMessageIdsRef.current = new Set();
      return;
    }

    let cancelled = false;

    async function loadInitial() {
      try {
        const response = await getDmMessages(activeDmId!);
        if (cancelled) return;
        knownMessageIdsRef.current = new Set(response.messages.map((msg) => msg.id));
        setMessages(response.messages);
      } catch {
        // ignore
      }
    }

    void loadInitial();

    const client = new DmChannelClient(activeDmId, (event) => {
      if (event.type !== "message-create") {
        return;
      }
      const msg = event.message;
      if (knownMessageIdsRef.current.has(msg.id)) {
        return;
      }
      knownMessageIdsRef.current.add(msg.id);
      if (msg.author.id !== user?.id) {
        pushNotification({
          title: isVoiceInviteMessage(msg.content) ? "Voice invite" : msg.author.displayName,
          body: isVoiceInviteMessage(msg.content)
            ? stripVoiceInviteMarker(msg.content).slice(0, 120)
            : msg.content.slice(0, 120) || "Attachment",
          type: isVoiceInviteMessage(msg.content) ? "voice-invite" : "dm",
        });
      }
      setMessages((current) => [...current, msg]);
    });

    client.connect();

    return () => {
      cancelled = true;
      client.disconnect();
    };
  }, [activeDmId, user?.id, pushNotification]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, activeDmId]);

  async function handleAddFriend(event: FormEvent) {
    event.preventDefault();
    if (!addUsername.trim()) return;
    try {
      await sendFriendRequest(addUsername.trim());
      setAddUsername("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  }

  async function handleOpenDm(userId: string) {
    try {
      const response = await openDm(userId);
      setActiveDmId(response.channelId);
      setView("dms");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open DM.");
    }
  }

  async function handleSendDm(event: FormEvent) {
    event.preventDefault();
    if (!activeDmId || (!draft.trim() && pendingAttachmentIds.length === 0)) return;
    try {
      const response = await sendDmMessage(activeDmId, draft.trim(), pendingAttachmentIds);
      setMessages((current) => [...current, response.message]);
      knownMessageIdsRef.current.add(response.message.id);
      setDraft("");
      setPendingAttachmentIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message.");
    }
  }

  async function handleUploadFile(file: File) {
    if (!activeDmId) return;
    setUploading(true);
    try {
      const response = await uploadDmAttachment(activeDmId, file);
      setPendingAttachmentIds((current) => [...current, response.attachment.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveEdit(messageId: string) {
    if (!activeDmId || !editDraft.trim()) return;
    try {
      const response = await editDmMessage(activeDmId, messageId, editDraft.trim());
      setMessages((current) =>
        current.map((item) => (item.id === messageId ? response.message : item)),
      );
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not edit message.");
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!activeDmId || !window.confirm("Delete this message?")) return;
    try {
      await deleteDmMessage(activeDmId, messageId);
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete message.");
    }
    setMenuMessageId(null);
  }

  async function handleReaction(messageId: string, emoji: string) {
    if (!activeDmId) return;
    const dm = messages.find((item) => item.id === messageId);
    const existing = dm?.reactions?.find((r) => r.emoji === emoji);
    try {
      if (existing?.me) {
        await removeDmReaction(activeDmId, messageId, emoji);
      } else {
        await addDmReaction(activeDmId, messageId, emoji);
      }
      const response = await getDmMessages(activeDmId);
      setMessages(response.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update reaction.");
    }
    setReactionPickerMessageId(null);
    setMenuMessageId(null);
  }

  async function handleCreateGroupDm(event: FormEvent) {
    event.preventDefault();
    if (groupSelection.length < 1) return;
    try {
      const response = await createGroupDm({
        userIds: groupSelection,
        name: groupName.trim() || undefined,
      });
      setGroupOpen(false);
      setGroupSelection([]);
      setGroupName("");
      setActiveDmId(response.channelId);
      setView("dms");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group DM.");
    }
  }

  function closeMessageMenus() {
    setMenuMessageId(null);
    setReactionPickerMessageId(null);
  }

  const activeDm = dmChannels.find((ch) => ch.id === activeDmId) ?? null;

  return (
    <div className="friends-dm-panel">
      <div className="friends-dm-sidebar">
        <div className="friends-dm-tabs">
          <button type="button" className={view === "friends" ? "active" : ""} onClick={() => setView("friends")}>
            Friends
          </button>
          <button type="button" className={view === "dms" ? "active" : ""} onClick={() => setView("dms")}>
            Messages
          </button>
        </div>

        {view === "friends" ? (
          <div className="friends-list-wrap">
            <form className="friends-add-form" onSubmit={handleAddFriend}>
              <input
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="Add friend by username"
              />
              <button type="submit">Add</button>
            </form>
            {incoming.length > 0 && (
              <section>
                <h4>Incoming</h4>
                {incoming.map((req) => (
                  <div key={req.id} className="friend-row">
                    <span>{req.displayName}</span>
                    <button type="button" onClick={() => void acceptFriendRequest(req.id).then(reload)}>
                      Accept
                    </button>
                    <button type="button" onClick={() => void declineFriendRequest(req.id).then(reload)}>
                      Decline
                    </button>
                  </div>
                ))}
              </section>
            )}
            <section>
              <h4>All Friends — {friends.length}</h4>
              {friends.map((friend) => (
                <div key={friend.userId} className="friend-row">
                  <UserAvatar username={friend.username} avatarUrl={friend.avatarUrl} size="sidebar" />
                  <button type="button" onClick={() => void handleOpenDm(friend.userId)}>
                    {friend.displayName}
                  </button>
                  <button type="button" onClick={() => void removeFriend(friend.userId).then(reload)}>
                    Remove
                  </button>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <div className="dm-channel-list">
            <button type="button" className="dm-create-group-btn" onClick={() => setGroupOpen((v) => !v)}>
              Create Group DM
            </button>
            {groupOpen && (
              <form className="dm-group-form" onSubmit={handleCreateGroupDm}>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group name (optional)"
                />
                <div className="dm-group-friends">
                  {friends.map((friend) => (
                    <label key={friend.userId} className="dm-group-friend-option">
                      <input
                        type="checkbox"
                        checked={groupSelection.includes(friend.userId)}
                        onChange={(e) =>
                          setGroupSelection((current) =>
                            e.target.checked
                              ? [...current, friend.userId]
                              : current.filter((id) => id !== friend.userId),
                          )
                        }
                      />
                      {friend.displayName}
                    </label>
                  ))}
                </div>
                <button type="submit" disabled={groupSelection.length < 1}>
                  Create
                </button>
              </form>
            )}
            {dmChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={activeDmId === ch.id ? "dm-channel-item active" : "dm-channel-item"}
                onClick={() => setActiveDmId(ch.id)}
              >
                {ch.isGroup && <span className="dm-group-badge">Group</span>}
                {dmTitle(ch)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="friends-dm-main text-channel-panel">
        {error && <div className="settings-error">{error}</div>}
        {loading && <p>Loading...</p>}
        {view === "dms" && activeDm ? (
          <>
            <header className="dm-header text-channel-toolbar">
              <h2>{dmTitle(activeDm)}</h2>
              {activeDm.isGroup && (
                <p className="settings-muted">
                  {activeDm.participants.map((p) => p.displayName).join(", ")}
                </p>
              )}
            </header>
            <div className="dm-messages text-channel-messages" ref={listRef}>
              {channelMessages.map((message, index) => {
                const prev = index > 0 ? channelMessages[index - 1] : undefined;
                const grouped = shouldGroupWithPrevious(prev, message);
                const showDateDivider = !prev || isDifferentDay(prev.createdAt, message.createdAt);

                return (
                  <Fragment key={message.id}>
                    {showDateDivider && (
                      <div className="message-date-divider">
                        <span>{formatDateDivider(message.createdAt)}</span>
                      </div>
                    )}
                    {parseVoiceInvite(message.content) ? (
                      <VoiceInviteMessage
                        content={message.content}
                        joining={joiningVoiceInvite}
                        onJoin={(serverId, channelId) => onJoinVoiceInvite?.(serverId, channelId)}
                      />
                    ) : (
                      <TextChannelMessage
                        message={message}
                        grouped={grouped}
                        inThread={false}
                        threadCount={0}
                        currentUserId={user?.id ?? ""}
                        currentUsername={user?.username}
                        currentDisplayName={user?.displayName}
                        canManageMessages={false}
                        variant="dm"
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
                        onReply={() => undefined}
                        onOpenThread={() => undefined}
                        onReport={() => undefined}
                        onEdit={() => {
                          setEditingId(message.id);
                          setEditDraft(message.content);
                          closeMessageMenus();
                        }}
                        onDelete={() => void handleDeleteMessage(message.id)}
                        onTogglePin={() => undefined}
                        onSaveEdit={() => void handleSaveEdit(message.id)}
                        onCancelEdit={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                        onReaction={(emoji) => void handleReaction(message.id, emoji)}
                        onJumpToReply={() => undefined}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
            <div className="text-channel-footer">
              <form className="text-channel-composer-wrap" onSubmit={handleSendDm}>
                <div className="text-channel-composer-card">
                  <div className="text-channel-composer-inner">
                    <label className="text-channel-attach" title="Upload a file">
                      <AttachIcon />
                      <input
                        ref={fileInputRef}
                        type="file"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleUploadFile(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={`Message ${dmTitle(activeDm)}`}
                      rows={1}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          if (!activeDmId || (!draft.trim() && pendingAttachmentIds.length === 0)) return;
                          void (async () => {
                            try {
                              const response = await sendDmMessage(
                                activeDmId,
                                draft.trim(),
                                pendingAttachmentIds,
                              );
                              setMessages((current) => [...current, response.message]);
                              knownMessageIdsRef.current.add(response.message.id);
                              setDraft("");
                              setPendingAttachmentIds([]);
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Could not send message.");
                            }
                          })();
                        }
                      }}
                    />
                    {pendingAttachmentIds.length > 0 && (
                      <span className="dm-pending-attachments">{pendingAttachmentIds.length} file(s)</span>
                    )}
                    <button type="submit" className="text-channel-send" disabled={uploading}>
                      Send
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </>
        ) : view === "dms" ? (
          <p className="settings-muted">Select a conversation or message a friend.</p>
        ) : (
          <p className="settings-muted">Add friends by username to start direct messaging.</p>
        )}
      </div>
    </div>
  );
}
