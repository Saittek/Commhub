import { FormEvent, useState } from "react";
import { createChannel, type Channel, type ChannelType } from "../lib/api";
import ChannelSettingsModal from "./ChannelSettingsModal";
import { GearIcon, PlusIcon } from "./UiIcons";

interface ChannelListProps {
  serverId: string;
  channels: Channel[];
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
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
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className="channel-voice-icon">
      <path
        fill="currentColor"
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-1 12.73V18H8v2h8v-2h-3v-2.27A7.01 7.01 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7.01 7.01 0 0 0 6 4.73z"
      />
    </svg>
  );
}

interface ChannelSectionProps {
  title: string;
  type: ChannelType;
  serverId: string;
  channels: Channel[];
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
  openCreator: ChannelType | null;
  editingChannelId: string | null;
  onToggleCreator: (type: ChannelType) => void;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onEditChannel: (channelId: string) => void;
}

function ChannelSection({
  title,
  type,
  serverId,
  channels,
  activeChannelId,
  connectedVoiceChannelId,
  openCreator,
  editingChannelId,
  onToggleCreator,
  onSelectChannel,
  onChannelCreated,
  onEditChannel,
}: ChannelSectionProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pulse, setPulse] = useState(false);
  const isOpen = openCreator === type;

  function handleToggle() {
    setPulse(true);
    setError(null);
    if (!isOpen) {
      setName("");
    }
    onToggleCreator(type);
    window.setTimeout(() => setPulse(false), 400);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await createChannel(serverId, name, type);
      onChannelCreated(response.channel);
      setName("");
      onToggleCreator(type);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create channel.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="channel-group">
      <div className="channel-group-header">
        <h4 className="channel-group-heading">{title}</h4>
        <button
          type="button"
          className={`channel-circle-btn channel-add-btn ${isOpen ? "open" : ""} ${pulse ? "pulse" : ""}`}
          onClick={handleToggle}
          aria-label={`Create ${type} channel`}
          aria-expanded={isOpen}
        >
          <PlusIcon className="channel-circle-icon channel-action-icon" />
        </button>
      </div>

      <div className="channel-list">
        {channels.length === 0 ? (
          <p className="channel-empty">No {type} channels yet</p>
        ) : (
          channels.map((channel) => (
            <div
              key={channel.id}
              className={
                activeChannelId === channel.id || editingChannelId === channel.id
                  ? "channel-item-wrap active"
                  : connectedVoiceChannelId === channel.id
                    ? "channel-item-wrap connected"
                    : "channel-item-wrap"
              }
            >
              <button
                type="button"
                className="channel-item"
                onClick={() => onSelectChannel(channel.id)}
              >
                {type === "text" ? <TextChannelIcon /> : <VoiceChannelIcon />}
                <span>{channel.name}</span>
                {type === "voice" && connectedVoiceChannelId === channel.id && (
                  <span className="channel-connected-badge">Live</span>
                )}
              </button>
              <button
                type="button"
                className="channel-circle-btn channel-edit-btn"
                onClick={() => onEditChannel(channel.id)}
                aria-label={`Edit ${channel.name}`}
                title="Edit channel"
              >
                <GearIcon className="channel-circle-icon channel-action-icon" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={`channel-create-panel ${isOpen ? "open" : ""}`}>
        <form className="channel-create-form" onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={type === "text" ? "new-channel" : "voice-lounge"}
            required
            minLength={2}
            maxLength={32}
            autoFocus={isOpen}
          />
          <div className="channel-create-actions">
            <button type="submit" className="channel-create-submit" disabled={submitting}>
              {submitting ? "..." : "Create"}
            </button>
            <button
              type="button"
              className="channel-create-cancel"
              onClick={handleToggle}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
          {error && <p className="channel-create-error">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default function ChannelList({
  serverId,
  channels,
  activeChannelId,
  connectedVoiceChannelId,
  onSelectChannel,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
}: ChannelListProps) {
  const [openCreator, setOpenCreator] = useState<ChannelType | null>(null);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

  const editingChannel = channels.find((channel) => channel.id === editingChannelId) ?? null;

  function handleToggleCreator(type: ChannelType) {
    setOpenCreator((current) => (current === type ? null : type));
  }

  const textChannels = channels.filter((channel) => channel.type === "text");
  const voiceChannels = channels.filter((channel) => channel.type === "voice");

  return (
    <>
      <div className="channel-list-wrap">
        <ChannelSection
          title="Text Channels"
          type="text"
          serverId={serverId}
          channels={textChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          openCreator={openCreator}
          editingChannelId={editingChannelId}
          onToggleCreator={handleToggleCreator}
          onSelectChannel={onSelectChannel}
          onChannelCreated={onChannelCreated}
          onEditChannel={setEditingChannelId}
        />
        <ChannelSection
          title="Voice Channels"
          type="voice"
          serverId={serverId}
          channels={voiceChannels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={connectedVoiceChannelId}
          openCreator={openCreator}
          editingChannelId={editingChannelId}
          onToggleCreator={handleToggleCreator}
          onSelectChannel={onSelectChannel}
          onChannelCreated={onChannelCreated}
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
    </>
  );
}
