import { FormEvent, useState } from "react";
import { deleteChannel, updateChannel, type Channel } from "../lib/api";

interface ChannelSettingsModalProps {
  serverId: string;
  channel: Channel;
  onClose: () => void;
  onUpdated: (channel: Channel) => void;
  onDeleted: (channelId: string) => void;
}

export default function ChannelSettingsModal({
  serverId,
  channel,
  onClose,
  onUpdated,
  onDeleted,
}: ChannelSettingsModalProps) {
  const [name, setName] = useState(channel.name);
  const [voiceBitrate, setVoiceBitrate] = useState(channel.voiceBitrate ?? 64000);
  const [voiceUserLimit, setVoiceUserLimit] = useState(channel.voiceUserLimit ?? 0);
  const [voicePttOnly, setVoicePttOnly] = useState(channel.voicePttOnly ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await updateChannel(serverId, channel.id, {
        name,
        ...(channel.type === "voice"
          ? {
              voiceBitrate,
              voiceUserLimit,
              voicePttOnly,
            }
          : {}),
      });
      onUpdated(response.channel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update channel.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const label = channel.type === "text" ? `#${channel.name}` : channel.name;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteChannel(serverId, channel.id);
      onDeleted(channel.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete channel.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="channel-settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="channel-settings-header">
          <h2>Edit {channel.type === "text" ? "Text" : "Voice"} Channel</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="channel-settings-form" onSubmit={handleSubmit}>
          {error && <div className="settings-error">{error}</div>}

          <label>
            Channel Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={channel.type === "text" ? "general" : "voice-lounge"}
              required
              minLength={2}
              maxLength={32}
              disabled={saving}
              autoFocus
            />
          </label>
          <p className="settings-muted">
            Names are formatted automatically (lowercase, hyphens instead of spaces).
          </p>

          {channel.type === "voice" && (
            <div className="voice-channel-settings">
              <h3>Voice Settings</h3>
              <label>
                Audio Quality
                <select
                  value={voiceBitrate}
                  onChange={(event) => setVoiceBitrate(Number(event.target.value))}
                  disabled={saving}
                >
                  <option value={32000}>Low (32 kbps)</option>
                  <option value={64000}>Standard (64 kbps)</option>
                  <option value={96000}>High (96 kbps)</option>
                </select>
              </label>
              <label>
                User Limit
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={voiceUserLimit}
                  onChange={(event) => setVoiceUserLimit(Number(event.target.value))}
                  disabled={saving}
                />
              </label>
              <p className="settings-muted">Set to 0 for unlimited users in this channel.</p>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={voicePttOnly}
                  onChange={(event) => setVoicePttOnly(event.target.checked)}
                  disabled={saving}
                />
                Push-to-talk only (hold Space to speak)
              </label>
            </div>
          )}

          <div className="channel-settings-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              className="danger-button subtle"
              onClick={() => void handleDelete()}
              disabled={saving}
            >
              Delete Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
