import { FormEvent, useEffect, useState } from "react";
import {
  deleteChannel,
  getChannelCategories,
  getChannelNotifications,
  getServerRoles,
  setChannelNotifications,
  setChannelOverwrite,
  updateChannel,
  type Channel,
  type ChannelCategory,
  type NotificationLevel,
  type RolePermissions,
} from "../lib/api";
import { PERMISSION_GROUPS, type PermissionKey } from "../lib/permissions";

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
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [slowModeSeconds, setSlowModeSeconds] = useState(channel.slowModeSeconds ?? 0);
  const [nsfw, setNsfw] = useState(channel.nsfw ?? false);
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? "");
  const [categories, setCategories] = useState<ChannelCategory[]>([]);
  const [notificationLevel, setNotificationLevel] = useState<NotificationLevel>("inherit");
  const [showOverwrites, setShowOverwrites] = useState(false);
  const [overwriteRoleId, setOverwriteRoleId] = useState("");
  const [overwriteAllow, setOverwriteAllow] = useState<Partial<Record<PermissionKey, boolean>>>({});
  const [roles, setRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getChannelCategories(serverId).then((r) => setCategories(r.categories));
    void getChannelNotifications(serverId, channel.id).then((r) => setNotificationLevel(r.level));
    void getServerRoles(serverId).then((r) => setRoles(r.roles.map((role) => ({ id: role.id, name: role.name }))));
  }, [serverId, channel.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await updateChannel(serverId, channel.id, {
        name,
        categoryId: categoryId || null,
        ...(channel.type === "voice"
          ? {
              voiceBitrate,
              voiceUserLimit,
              voicePttOnly,
            }
          : {
              topic,
              slowModeSeconds,
              nsfw,
            }),
      });
      await setChannelNotifications(serverId, channel.id, notificationLevel);
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

          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={saving}>
              <option value="">No category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Notification settings
            <select
              value={notificationLevel}
              onChange={(e) => setNotificationLevel(e.target.value as NotificationLevel)}
              disabled={saving}
            >
              <option value="inherit">Use default</option>
              <option value="all">All messages</option>
              <option value="mentions">Only @mentions</option>
              <option value="nothing">Nothing</option>
            </select>
          </label>

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
                  max={25}
                  value={voiceUserLimit}
                  onChange={(event) => setVoiceUserLimit(Number(event.target.value))}
                  disabled={saving}
                />
              </label>
              <p className="settings-muted">
                Set to 0 for the platform maximum ({25} users). Lower values cap the channel below
                that.
              </p>
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

          {channel.type === "text" && (
            <div className="text-channel-settings">
              <h3>Text Channel Settings</h3>
              <label>
                Topic
                <input
                  type="text"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  maxLength={1024}
                  disabled={saving}
                  placeholder="What is this channel about?"
                />
              </label>
              <label>
                Slow mode (seconds)
                <input
                  type="number"
                  min={0}
                  max={21600}
                  value={slowModeSeconds}
                  onChange={(event) => setSlowModeSeconds(Number(event.target.value))}
                  disabled={saving}
                />
              </label>
              <p className="settings-muted">Members must wait between messages. 0 disables slow mode.</p>
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={nsfw}
                  onChange={(event) => setNsfw(event.target.checked)}
                  disabled={saving}
                />
                Age-restricted channel (NSFW)
              </label>
            </div>
          )}

          <div className="channel-overwrites-section">
            <button type="button" className="secondary-button" onClick={() => setShowOverwrites((v) => !v)}>
              {showOverwrites ? "Hide" : "Edit"} Permission Overwrites
            </button>
            {showOverwrites && (
              <div className="channel-overwrites-form">
                <select value={overwriteRoleId} onChange={(e) => setOverwriteRoleId(e.target.value)}>
                  <option value="">Select role...</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.id}>
                    <h4>{group.label}</h4>
                    {group.permissions.map((perm) => (
                      <label key={perm.key} className="permission-item">
                        <input
                          type="checkbox"
                          checked={overwriteAllow[perm.key] === true}
                          onChange={() =>
                            setOverwriteAllow((c) => ({ ...c, [perm.key]: !c[perm.key] }))
                          }
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (!overwriteRoleId) return;
                    void setChannelOverwrite(serverId, channel.id, {
                      targetType: "role",
                      targetId: overwriteRoleId,
                      allow: overwriteAllow as RolePermissions,
                      deny: {},
                    });
                  }}
                >
                  Save Overwrite
                </button>
              </div>
            )}
          </div>

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
