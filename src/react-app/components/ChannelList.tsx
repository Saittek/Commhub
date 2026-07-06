import { useEffect, useState } from "react";
import {
  deleteChannelCategory,
  getChannelCategories,
  updateChannel,
  updateChannelCategory,
  type Channel,
  type ChannelCategory,
  type ChannelType,
} from "../lib/api";
import ChannelSettingsModal from "./ChannelSettingsModal";
import CreateChannelModal from "./CreateChannelModal";
import { GearIcon, PlusIcon } from "./UiIcons";

interface ChannelListProps {
  serverId: string;
  channels: Channel[];
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
  unreadCounts?: Record<string, number>;
  canManage?: boolean;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelDeleted: (channelId: string) => void;
}

function TextChannelIcon() {
  return <span className="channel-prefix">#</span>;
}

function VoiceChannelIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="channel-voice-icon">
      <path
        fill="currentColor"
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-1 12.73V18H8v2h8v-2h-3v-2.27A7.01 7.01 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7.01 7.01 0 0 0 6 4.73z"
      />
    </svg>
  );
}

function ChannelIcon({ type }: { type: ChannelType }) {
  if (type === "text" || type === "announcement") return <TextChannelIcon />;
  if (type === "forum") return <span className="channel-prefix">◆</span>;
  if (type === "stage") return <span className="channel-prefix">🎙</span>;
  return <VoiceChannelIcon />;
}

interface ChannelRowProps {
  channel: Channel;
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
  unreadCounts?: Record<string, number>;
  editingChannelId: string | null;
  canManage?: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelectChannel: (channelId: string) => void;
  onEditChannel: (channelId: string) => void;
  onDragStart: (channelId: string) => void;
  onDragEnd: () => void;
  onDragOver: (channelId: string) => void;
  onDrop: (channelId: string) => void;
}

function ChannelRow({
  channel,
  activeChannelId,
  connectedVoiceChannelId,
  unreadCounts = {},
  editingChannelId,
  canManage,
  isDragging,
  isDragOver,
  onSelectChannel,
  onEditChannel,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ChannelRowProps) {
  const showUnread =
    (channel.type === "text" || channel.type === "announcement") &&
    (unreadCounts[channel.id] ?? 0) > 0 &&
    activeChannelId !== channel.id;

  return (
    <div
      className={[
        "channel-item-wrap",
        activeChannelId === channel.id || editingChannelId === channel.id ? "active" : "",
        connectedVoiceChannelId === channel.id ? "connected" : "",
        isDragging ? "channel-dragging" : "",
        isDragOver ? "channel-drag-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={canManage}
      onDragStart={() => onDragStart(channel.id)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver(channel.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(channel.id);
      }}
    >
      <button type="button" className="channel-item" onClick={() => onSelectChannel(channel.id)}>
        <ChannelIcon type={channel.type} />
        <span>{channel.name}</span>
        {showUnread && <span className="channel-unread-badge">{unreadCounts[channel.id]}</span>}
        {channel.type === "voice" && connectedVoiceChannelId === channel.id && (
            <span className="channel-connected-badge">Live</span>
          )}
        {channel.type === "stage" && connectedVoiceChannelId === channel.id && (
            <span className="channel-connected-badge">Stage</span>
          )}
      </button>
      {canManage && (
        <button
          type="button"
          className="channel-circle-btn channel-edit-btn"
          onClick={() => onEditChannel(channel.id)}
          aria-label={`Edit ${channel.name}`}
          title="Edit channel"
        >
          <GearIcon className="channel-circle-icon channel-action-icon" />
        </button>
      )}
    </div>
  );
}

interface ChannelSectionProps {
  title: string;
  type: ChannelType;
  channels: Channel[];
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
  unreadCounts?: Record<string, number>;
  editingChannelId: string | null;
  canManage?: boolean;
  draggingChannelId: string | null;
  dragOverChannelId: string | null;
  onOpenCreate: (type: ChannelType) => void;
  onSelectChannel: (channelId: string) => void;
  onEditChannel: (channelId: string) => void;
  onDragStart: (channelId: string) => void;
  onDragEnd: () => void;
  onDragOver: (channelId: string) => void;
  onDrop: (targetId: string, list: Channel[]) => void;
}

function ChannelSection({
  title,
  type,
  channels,
  activeChannelId,
  connectedVoiceChannelId,
  unreadCounts = {},
  editingChannelId,
  canManage,
  draggingChannelId,
  dragOverChannelId,
  onOpenCreate,
  onSelectChannel,
  onEditChannel,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: ChannelSectionProps) {
  const [pulse, setPulse] = useState(false);

  function handleOpenCreate() {
    if (!canManage) return;
    setPulse(true);
    onOpenCreate(type);
    window.setTimeout(() => setPulse(false), 400);
  }

  return (
    <div className="channel-group">
      <div className="channel-group-header">
        <h4 className="channel-group-heading">{title}</h4>
        {canManage && (
          <button
            type="button"
            className={`channel-circle-btn channel-add-btn ${pulse ? "pulse" : ""}`}
            onClick={handleOpenCreate}
            aria-label={`Create ${type} channel`}
          >
            <PlusIcon className="channel-circle-icon channel-action-icon" />
          </button>
        )}
      </div>

      <div className="channel-list">
        {channels.length === 0 ? (
          <p className="channel-empty">No {type} channels yet</p>
        ) : (
          channels.map((channel) => (
            <ChannelRow
              key={channel.id}
              channel={channel}
              activeChannelId={activeChannelId}
              connectedVoiceChannelId={connectedVoiceChannelId}
              unreadCounts={unreadCounts}
              editingChannelId={editingChannelId}
              canManage={canManage}
              isDragging={draggingChannelId === channel.id}
              isDragOver={dragOverChannelId === channel.id}
              onSelectChannel={onSelectChannel}
              onEditChannel={onEditChannel}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={(targetId) => onDrop(targetId, channels)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function sortChannels(list: Channel[]) {
  return [...list].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export default function ChannelList({
  serverId,
  channels,
  activeChannelId,
  connectedVoiceChannelId,
  unreadCounts,
  canManage = false,
  onSelectChannel,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
}: ChannelListProps) {
  const [creatingChannelType, setCreatingChannelType] = useState<ChannelType | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [draggingChannelId, setDraggingChannelId] = useState<string | null>(null);
  const [dragOverChannelId, setDragOverChannelId] = useState<string | null>(null);

  const editingChannel = channels.find((channel) => channel.id === editingChannelId) ?? null;

  useEffect(() => {
    void getChannelCategories(serverId)
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, [serverId, channels]);

  async function handleRenameCategory(category: ChannelCategory) {
    const name = window.prompt("Rename category:", category.name);
    if (!name?.trim() || name.trim() === category.name) return;
    try {
      await updateChannelCategory(serverId, category.id, { name: name.trim() });
      setCategories((current) =>
        current.map((item) => (item.id === category.id ? { ...item, name: name.trim() } : item)),
      );
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not rename category.");
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!window.confirm("Delete this category? Channels will become uncategorized.")) return;
    try {
      await deleteChannelCategory(serverId, categoryId);
      setCategories((current) => current.filter((item) => item.id !== categoryId));
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not delete category.");
    }
  }

  async function handleDropChannel(draggedId: string, targetId: string, list: Channel[]) {
    if (draggedId === targetId) return;
    const sorted = sortChannels(list);
    const dragIndex = sorted.findIndex((item) => item.id === draggedId);
    const targetIndex = sorted.findIndex((item) => item.id === targetId);
    if (dragIndex === -1 || targetIndex === -1) return;

    const reordered = [...sorted];
    const [removed] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    try {
      const updates = await Promise.all(
        reordered.map((channel, index) =>
          updateChannel(serverId, channel.id, { position: index }),
        ),
      );
      updates.forEach((response) => onChannelUpdated(response.channel));
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : "Could not reorder channel.");
    }
  }

  const uncategorized = sortChannels(channels.filter((c) => !c.categoryId));
  const textChannels = uncategorized.filter((channel) => channel.type === "text");
  const announcementChannels = uncategorized.filter((channel) => channel.type === "announcement");
  const forumChannels = uncategorized.filter((channel) => channel.type === "forum");
  const voiceChannels = uncategorized.filter((channel) => channel.type === "voice");
  const stageChannels = uncategorized.filter((channel) => channel.type === "stage");

  const dragHandlers = {
    draggingChannelId,
    dragOverChannelId,
    onDragStart: setDraggingChannelId,
    onDragEnd: () => {
      setDraggingChannelId(null);
      setDragOverChannelId(null);
    },
    onDragOver: setDragOverChannelId,
    onDrop: (targetId: string, list: Channel[]) => {
      if (draggingChannelId) {
        void handleDropChannel(draggingChannelId, targetId, list);
      }
      setDraggingChannelId(null);
      setDragOverChannelId(null);
    },
  };

  function renderCategoryChannels(catChannels: Channel[]) {
    return catChannels.map((channel) => (
      <ChannelRow
        key={channel.id}
        channel={channel}
        activeChannelId={activeChannelId}
        connectedVoiceChannelId={connectedVoiceChannelId}
        unreadCounts={unreadCounts}
        editingChannelId={editingChannelId}
        canManage={canManage}
        isDragging={draggingChannelId === channel.id}
        isDragOver={dragOverChannelId === channel.id}
        onSelectChannel={onSelectChannel}
        onEditChannel={setEditingChannelId}
        onDragStart={dragHandlers.onDragStart}
        onDragEnd={dragHandlers.onDragEnd}
        onDragOver={dragHandlers.onDragOver}
        onDrop={(targetId) => dragHandlers.onDrop(targetId, catChannels)}
      />
    ));
  }

  return (
    <>
      {categoryError && <p className="channel-create-error">{categoryError}</p>}

      {categories.map((category) => {
        const catChannels = sortChannels(channels.filter((c) => c.categoryId === category.id));
        if (catChannels.length === 0 && !canManage) return null;
        return (
          <div key={category.id} className="channel-category-group">
            <div className="channel-category-header">
              <button
                type="button"
                className="channel-category-heading-btn"
                onClick={() => canManage && void handleRenameCategory(category)}
                title={canManage ? "Click to rename" : undefined}
              >
                {category.name}
              </button>
              {canManage && (
                <button
                  type="button"
                  className="channel-category-delete-btn"
                  onClick={() => void handleDeleteCategory(category.id)}
                  aria-label={`Delete ${category.name}`}
                  title="Delete category"
                >
                  ×
                </button>
              )}
            </div>
            <div className="channel-list">
              {catChannels.length === 0 ? (
                <p className="channel-empty">Empty category</p>
              ) : (
                renderCategoryChannels(catChannels)
              )}
            </div>
          </div>
        );
      })}

      <div className="channel-list-wrap">
        <ChannelSection
          title="Text channels"
          type="text"
          channels={textChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          unreadCounts={unreadCounts}
          editingChannelId={editingChannelId}
          canManage={canManage}
          {...dragHandlers}
          onOpenCreate={setCreatingChannelType}
          onSelectChannel={onSelectChannel}
          onEditChannel={setEditingChannelId}
        />
        <ChannelSection
          title="Announcement"
          type="announcement"
          channels={announcementChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          unreadCounts={unreadCounts}
          editingChannelId={editingChannelId}
          canManage={canManage}
          {...dragHandlers}
          onOpenCreate={setCreatingChannelType}
          onSelectChannel={onSelectChannel}
          onEditChannel={setEditingChannelId}
        />
        <ChannelSection
          title="Forum"
          type="forum"
          channels={forumChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          unreadCounts={unreadCounts}
          editingChannelId={editingChannelId}
          canManage={canManage}
          {...dragHandlers}
          onOpenCreate={setCreatingChannelType}
          onSelectChannel={onSelectChannel}
          onEditChannel={setEditingChannelId}
        />
        <ChannelSection
          title="Voice channels"
          type="voice"
          channels={voiceChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          unreadCounts={unreadCounts}
          editingChannelId={editingChannelId}
          canManage={canManage}
          {...dragHandlers}
          onOpenCreate={setCreatingChannelType}
          onSelectChannel={onSelectChannel}
          onEditChannel={setEditingChannelId}
        />
        <ChannelSection
          title="Stage channels"
          type="stage"
          channels={stageChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          unreadCounts={unreadCounts}
          editingChannelId={editingChannelId}
          canManage={canManage}
          {...dragHandlers}
          onOpenCreate={setCreatingChannelType}
          onSelectChannel={onSelectChannel}
          onEditChannel={setEditingChannelId}
        />
      </div>

      {editingChannel && (
        <ChannelSettingsModal
          serverId={serverId}
          channel={editingChannel}
          onClose={() => setEditingChannelId(null)}
          onUpdated={onChannelUpdated}
          onDeleted={onChannelDeleted}
        />
      )}

      {creatingChannelType && (
        <CreateChannelModal
          serverId={serverId}
          type={creatingChannelType}
          onClose={() => setCreatingChannelType(null)}
          onCreated={(channel) => {
            onChannelCreated(channel);
            onSelectChannel(channel.id);
          }}
        />
      )}
    </>
  );
}
