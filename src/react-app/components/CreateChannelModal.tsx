import { FormEvent, useEffect, useState } from "react";
import {
  createChannel,
  getChannelCategories,
  getServerRoles,
  setChannelNotifications,
  setChannelOverwrite,
  updateChannel,
  type Channel,
  type ChannelCategory,
  type ChannelType,
  type NotificationLevel,
  type RolePermissions,
} from "../lib/api";
import { PERMISSION_GROUPS, type PermissionKey } from "../lib/permissions";

interface CreateChannelModalProps {
  serverId: string;
  type: ChannelType;
  onClose: () => void;
  onCreated: (channel: Channel) => void;
}

export default function CreateChannelModal({
  serverId,
  type,
  onClose,
  onCreated,
}: CreateChannelModalProps) {
  const [name, setName] = useState("");
  const [voiceBitrate, setVoiceBitrate] = useState(64000);
  const [voiceUserLimit, setVoiceUserLimit] = useState(0);
  const [voicePttOnly, setVoicePttOnly] = useState(false);
  const [topic, setTopic] = useState("");
  const [slowModeSeconds, setSlowModeSeconds] = useState(0);
  const [nsfw, setNsfw] = useState(false);
  const [categoryId, setCategoryId] = useState("");
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
    void getServerRoles(serverId).then((r) => setRoles(r.roles.map((role) => ({ id: role.id, name: role.name }))));
  }, [serverId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const created = await createChannel(serverId, name, type);
      const channelId = created.channel.id;

      const updated = await updateChannel(serverId, channelId, {
        categoryId: categoryId || null,
        ...(type === "voice"
          ? { voiceBitrate, voiceUserLimit, voicePttOnly }
          : { topic, slowModeSeconds, nsfw }),
      });

      if (notificationLevel !== "inherit") {
        await setChannelNotifications(serverId, channelId, notificationLevel);
      }

      if (overwriteRoleId && Object.keys(overwriteAllow).length > 0) {
        await setChannelOverwrite(serverId, channelId, {
          targetType: "role",
          targetId: overwriteRoleId,
          allow: overwriteAllow as RolePermissions,
          deny: {},
        });
      }

      onCreated(updated.channel);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create channel.");
    } finally {
      setSaving(false);
    }
  }

  const label = type === "text" ? "Text" : "Voice";

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="channel-settings-modal create-channel-modal" onClick={(event) => event.stopPropagation()}>
        <div className="channel-settings-header">
          <h2>Create {label} Channel</h2>
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
              placeholder={type === "text" ? "general" : "voice-lounge"}
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

          {type === "voice" && (
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

          {type === "text" && (
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
              {showOverwrites ? "Hide" : "Set"} Permission Overwrites
            </button>
            {showOverwrites && (
              <div className="channel-overwrites-form">
                <select value={overwriteRoleId} onChange={(e) => setOverwriteRoleId(e.target.value)} disabled={saving}>
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
                          disabled={saving}
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="channel-settings-actions">
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Creating..." : "Create Channel"}
            </button>
            <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
