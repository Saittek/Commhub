import { useEffect, useState, type ReactNode } from "react";
import {
  getMyPresence,
  getServerSounds,
  startActivity,
  updateMyActivity,
  updateMyPresence,
  type PresenceStatus,
  type ServerSound,
} from "../lib/api";
import { useVoice } from "../context/VoiceContext";
import type { User } from "../lib/api";
import type { JoinedVoiceChannel } from "../context/VoiceContext";
import UserAvatar from "./UserAvatar";
import { GearIcon, JoinServerIcon, LogOutIcon, FriendsIcon } from "./UiIcons";
import WatchTogetherModal from "./WatchTogetherModal";

interface SidebarUserPanelProps {
  user: User;
  serverId: string | null;
  voiceConnection: JoinedVoiceChannel | null;
  serverName: string | null;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  onToggleVoiceMute: () => void;
  onToggleVoiceDeafen: () => void;
  onDisconnectVoice: () => void;
  onOpenUserSettings: () => void;
  onOpenMicSettings: () => void;
  onOpenHeadphoneSettings: () => void;
  onOpenServerSettings: () => void;
  onJoinServer?: () => void;
  onLogout?: () => void;
  voiceError?: string | null;
  onClearVoiceError?: () => void;
  onOpenDm?: () => void;
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3C7.95 3 4.21 4.34 1.2 6.6L3 9c2.5-1.88 5.62-3 9-3s6.5 1.12 9 3l1.8-2.4C19.79 4.34 16.05 3 12 3m0 4c-2.76 0-5.3 1.12-7.15 2.95L6.7 12.2C8.08 10.94 9.97 10 12 10s3.92.94 5.3 2.2l1.85-2.25C17.3 8.12 14.76 7 12 7m0 4c-1.65 0-3.17.67-4.26 1.76L12 18l4.26-5.24C15.17 11.67 13.65 11 12 11"
      />
    </svg>
  );
}

function WaveformIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M3 10v4h2v-4H3m4 0v4h2v-4H7m4 0v4h2v-4h-2m4 0v4h2v-4h-2m4 0v4h2v-4h-2Z" />
    </svg>
  );
}

function PhoneLeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .55-.45 1-1 1H4v3h2.4c.55 0 1 .45 1 1v1.6c1.45.47 3 .72 4.6.72s3.15-.25 4.6-.72V18c0-.55.45-1 1-1H20v-3h-2.4c-.55 0-1-.45-1-1v-3.1A9.96 9.96 0 0 0 12 9m0 2c1.39 0 2.68.3 3.86.82l.14.07v2.11l-.14.07A9.86 9.86 0 0 1 12 15c-1.39 0-2.68-.3-3.86-.82l-.14-.07v-2.11l.14-.07A9.86 9.86 0 0 1 12 11"
      />
    </svg>
  );
}

function VideoOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z"
      />
    </svg>
  );
}

function VideoOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3.27 2 2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 22 21 20.73 3.27 2M16 10.18V6c0-.55-.45-1-1-1H9.82l2 2H15c.55 0 1 .45 1 1v3.18l2 2V10.18M16 16H4V8h1.82L16 16.18V16m6-6v3.11l2 2V11c0-1.1-.9-2-2-2h-1.58l1.55 1.55c.63.21 1.03.84 1.03 1.45"
      />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4M4 6h16v10H4V6"
      />
    </svg>
  );
}

function ActivitiesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M4 6h4v4H4V6m6 0h4v4h-4V6m6 0h4v4h-4V6M4 12h4v4H4v-4m6 0h4v4h-4v-4m6 0h4v4h-4v-4M4 18h4v2H4v-2m6 0h4v2h-4v-2m6 0h4v2h-4v-2Z" />
    </svg>
  );
}

function SoundboardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18 11c0-1.1-.9-2-2-2h-1V7c0-2.21-1.79-4-4-4S7 4.79 7 7v2H6c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2.28c.6-.35 1-1 1-1.72m-7-4c0-1.1.9-2 2-2s2 .9 2 2v2h-4V7m2 9H6v-4h7v4Z"
      />
    </svg>
  );
}

function ControlIcon({ slashed, children }: { slashed: boolean; children: ReactNode }) {
  return (
    <span className={`sidebar-control-icon${slashed ? " slashed" : ""}`}>
      {children}
    </span>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <ControlIcon slashed={muted}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3m5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20h-2v2h6v-2h-2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14"
        />
      </svg>
    </ControlIcon>
  );
}

function HeadphonesIcon({ deafened }: { deafened: boolean }) {
  return (
    <ControlIcon slashed={deafened}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3c-4.97 0-9 4.03-9 9v7c0 1.1.9 2 2 2h2v-9H5c0-3.87 3.13-7 7-7s7 3.13 7 7h-2v9h2c1.1 0 2-.9 2-2v-7c0-4.97-4.03-9-9-9"
        />
      </svg>
    </ControlIcon>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true">
      <path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
  );
}

function InVoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3m-1 1v2h2v-2h-2"
      />
    </svg>
  );
}

export default function SidebarUserPanel({
  user,
  serverId,
  voiceConnection,
  serverName,
  voiceMuted,
  voiceDeafened,
  onToggleVoiceMute,
  onToggleVoiceDeafen,
  onDisconnectVoice,
  onOpenUserSettings,
  onOpenMicSettings,
  onOpenHeadphoneSettings,
  onOpenServerSettings,
  onJoinServer,
  onLogout,
  voiceError,
  onClearVoiceError,
  onOpenDm,
}: SidebarUserPanelProps) {
  const voice = useVoice();
  const inVoice = Boolean(voiceConnection);
  const cameraOn = voice.localMedia.cameraEnabled;
  const screenOn = voice.localMedia.screenSharing;
  const voiceActivityActive =
    voice.localSpeaking || voice.peers.some((peer) => peer.speaking && !peer.deafened);
  const [status, setStatus] = useState<PresenceStatus>("online");
  const [statusOpen, setStatusOpen] = useState(false);
  const [activityName, setActivityName] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activitiesModalOpen, setActivitiesModalOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [sounds, setSounds] = useState<ServerSound[]>([]);
  const [startingActivity, setStartingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    void getMyPresence().then((r) => setStatus(r.presence.status));
  }, []);

  useEffect(() => {
    if (!serverId || !voiceConnection) {
      setSounds([]);
      return;
    }
    void getServerSounds(serverId)
      .then((response) => setSounds(response.sounds))
      .catch(() => setSounds([]));
  }, [serverId, voiceConnection?.channelId]);

  function playSound(sound: ServerSound) {
    voice.playSoundboard(sound);
  }

  async function handleStatusChange(next: PresenceStatus) {
    setStatus(next);
    setStatusOpen(false);
    await updateMyPresence({ status: next });
  }

  const statusLabel =
    status === "idle" ? "Idle" : status === "dnd" ? "Do Not Disturb" : status === "invisible" ? "Invisible" : "Online";

  async function handleStartWatchTogether() {
    if (!serverId || !voiceConnection) return;
    setStartingActivity(true);
    setActivityError(null);
    try {
      await startActivity(serverId, {
        channelId: voiceConnection.channelId,
        type: "watch",
        name: "Watch Together",
      });
      setActivitiesModalOpen(false);
      setWatchTogetherOpen(true);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Could not start activity.");
    } finally {
      setStartingActivity(false);
    }
  }

  const voicePath =
    voiceConnection && serverName
      ? `${voiceConnection.channelName} / ${serverName}`
      : voiceConnection?.channelName ?? null;

  return (
    <div className="sidebar-user-wrap">
      {voiceError && (
        <div className="sidebar-voice-error" role="alert">
          <span>{voiceError}</span>
          {onClearVoiceError && (
            <button type="button" className="sidebar-voice-error-dismiss" onClick={onClearVoiceError}>
              Dismiss
            </button>
          )}
        </div>
      )}
      <div className="sidebar-user-card">
      {voiceConnection && (
        <>
          <div className="voice-panel-connected">
            <div className="voice-panel-connected-left">
              <span className="voice-panel-signal" aria-hidden="true">
                <SignalIcon />
              </span>
              <div className="voice-panel-connected-text">
                <span className="voice-panel-connected-title">Voice Connected</span>
                <span className="voice-panel-connected-path">{voicePath}</span>
              </div>
            </div>
            <div className="voice-panel-connected-right">
              <button
                type="button"
                className={`icon-button icon-button-sm${voiceActivityActive ? " active" : ""}`}
                title={
                  voiceActivityActive
                    ? "Voice activity detected"
                    : "Waiting for voice activity"
                }
                aria-label="Voice activity"
              >
                <WaveformIcon />
              </button>
              <button
                type="button"
                className="icon-button icon-button-sm disconnect"
                title="Disconnect"
                onClick={onDisconnectVoice}
              >
                <PhoneLeaveIcon />
              </button>
            </div>
          </div>

          <div className="voice-panel-quick-actions">
            <button
              type="button"
              className={`icon-button icon-button-wide${cameraOn ? " active" : ""}`}
              title={cameraOn ? "Turn off camera" : "Turn on camera"}
              disabled={!inVoice}
              onClick={() => void voice.toggleCamera()}
            >
              {cameraOn ? <VideoOnIcon /> : <VideoOffIcon />}
            </button>
            <button
              type="button"
              className={`icon-button icon-button-wide${screenOn ? " active" : ""}`}
              title={screenOn ? "Stop sharing" : "Share screen"}
              disabled={!inVoice}
              onClick={() => void voice.toggleScreenShare()}
            >
              <ScreenShareIcon />
            </button>
            <button
              type="button"
              className="icon-button icon-button-wide"
              title="Activities"
              disabled={!inVoice || !serverId}
              onClick={() => setActivitiesModalOpen(true)}
            >
              <ActivitiesIcon />
            </button>
            <button
              type="button"
              className="icon-button icon-button-wide"
              title="Soundboard"
              disabled={!inVoice || !serverId || sounds.length === 0}
              onClick={() => setSoundboardOpen(true)}
            >
              <SoundboardIcon />
            </button>
            {onOpenDm && (
              <button
                type="button"
                className="icon-button icon-button-wide"
                title="Direct messages"
                onClick={onOpenDm}
              >
                <FriendsIcon />
              </button>
            )}
          </div>
        </>
      )}

      <div className="sidebar-user-panel">
        <button
          type="button"
          className="sidebar-user-identity"
          title="Profile settings"
          onClick={onOpenUserSettings}
        >
          <div className="sidebar-user-avatar-wrap">
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="sidebar" />
            <span className={`sidebar-user-status-dot status-${status}`} />
          </div>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-name">{user.username}</span>
            {voiceConnection ? (
              <span className="sidebar-user-status in-voice">
                <InVoiceIcon />
                In voice
              </span>
            ) : (
              <button
                type="button"
                className="sidebar-user-status status-picker-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusOpen((v) => !v);
                }}
              >
                {statusLabel}
              </button>
            )}
          </div>
        </button>
        {statusOpen && !voiceConnection && (
          <div className="status-picker-menu">
            {(["online", "idle", "dnd", "invisible"] as PresenceStatus[]).map((s) => (
              <button key={s} type="button" onClick={() => void handleStatusChange(s)}>
                {s === "online" ? "Online" : s === "idle" ? "Idle" : s === "dnd" ? "Do Not Disturb" : "Invisible"}
              </button>
            ))}
            <button type="button" onClick={() => setActivityOpen((v) => !v)}>
              Set Activity
            </button>
            {activityOpen && (
              <div className="activity-picker">
                <input
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  placeholder="Playing..."
                />
                <button
                  type="button"
                  onClick={() =>
                    void updateMyActivity({ activityType: "playing", activityName: activityName || null })
                  }
                >
                  Save
                </button>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-user-icon-row">
          <div className={`user-control-split${voiceMuted ? " active" : ""}`}>
            <button
              type="button"
              className="user-control-main"
              title={voiceMuted ? "Unmute" : "Mute"}
              onClick={onToggleVoiceMute}
            >
              <MicIcon muted={voiceMuted} />
            </button>
            <button
              type="button"
              className="user-control-chevron"
              title="Microphone settings"
              onClick={onOpenMicSettings}
            >
              <ChevronDownIcon />
            </button>
          </div>

          <div className={`user-control-split${voiceDeafened ? " active" : ""}`}>
            <button
              type="button"
              className="user-control-main"
              title={voiceDeafened ? "Undeafen" : "Deafen"}
              onClick={onToggleVoiceDeafen}
            >
              <HeadphonesIcon deafened={voiceDeafened} />
            </button>
            <button
              type="button"
              className="user-control-chevron"
              title="Headphone settings"
              onClick={onOpenHeadphoneSettings}
            >
              <ChevronDownIcon />
            </button>
          </div>

          <button
            type="button"
            className="icon-button icon-button-sm"
            title="Account menu"
            aria-label="Account menu"
            aria-expanded={userMenuOpen}
            onClick={() => {
              setUserMenuOpen((v) => !v);
              setStatusOpen(false);
            }}
          >
            <GearIcon />
          </button>
        </div>
        {userMenuOpen && (
          <div className="sidebar-user-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                onOpenUserSettings();
              }}
            >
              Profile settings
            </button>
            {serverName && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  onOpenServerSettings();
                }}
              >
                Server settings
              </button>
            )}
            {onJoinServer && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  onJoinServer();
                }}
              >
                <JoinServerIcon className="sidebar-user-menu-icon" />
                Join server
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                role="menuitem"
                className="sidebar-user-menu-danger"
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
              >
                <LogOutIcon className="sidebar-user-menu-icon" />
                Log out
              </button>
            )}
          </div>
        )}
      </div>
      </div>

      {watchTogetherOpen && serverId && voiceConnection && (
        <WatchTogetherModal
          serverId={serverId}
          channelId={voiceConnection.channelId}
          onClose={() => setWatchTogetherOpen(false)}
        />
      )}
      {activitiesModalOpen && (
        <div className="settings-overlay" onClick={() => setActivitiesModalOpen(false)}>
          <div
            className="channel-settings-modal"
            role="dialog"
            aria-label="Start an Activity"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="channel-settings-header">
              <h2>Start an Activity</h2>
              <button type="button" className="settings-close" onClick={() => setActivitiesModalOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            {activityError && <div className="settings-error">{activityError}</div>}
            <div className="app-modal-actions">
              <button
                type="button"
                className="activities-option"
                disabled={startingActivity}
                onClick={() => void handleStartWatchTogether()}
              >
                <strong>Watch Together</strong>
                <span>Watch videos with everyone in voice</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {soundboardOpen && (
        <div className="settings-overlay" onClick={() => setSoundboardOpen(false)}>
          <div
            className="channel-settings-modal"
            role="dialog"
            aria-label="Soundboard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="channel-settings-header">
              <h2>Soundboard</h2>
              <button type="button" className="settings-close" onClick={() => setSoundboardOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            {sounds.length === 0 ? (
              <p className="settings-muted app-modal-empty">No sounds uploaded for this server yet.</p>
            ) : (
              <div className="app-modal-actions voice-soundboard-buttons">
                {sounds.map((sound) => (
                  <button key={sound.id} type="button" className="voice-sound-btn" onClick={() => playSound(sound)}>
                    {sound.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
