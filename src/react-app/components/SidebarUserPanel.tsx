import type { ReactNode } from "react";
import type { User } from "../lib/api";
import type { JoinedVoiceChannel } from "../context/VoiceContext";
import UserAvatar from "./UserAvatar";
import { GearIcon } from "./UiIcons";

interface SidebarUserPanelProps {
  user: User;
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
}: SidebarUserPanelProps) {
  const voicePath =
    voiceConnection && serverName
      ? `${voiceConnection.channelName} / ${serverName}`
      : voiceConnection?.channelName ?? null;

  return (
    <div className="sidebar-user-stack">
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
                className="icon-button icon-button-sm"
                title="Voice activity"
                disabled
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
            <button type="button" className="icon-button icon-button-wide" title="Camera (coming soon)" disabled>
              <VideoOffIcon />
            </button>
            <button type="button" className="icon-button icon-button-wide" title="Share screen (coming soon)" disabled>
              <ScreenShareIcon />
            </button>
            <button type="button" className="icon-button icon-button-wide" title="Activities (coming soon)" disabled>
              <ActivitiesIcon />
            </button>
            <button type="button" className="icon-button icon-button-wide" title="Soundboard (coming soon)" disabled>
              <SoundboardIcon />
            </button>
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
            <span className="sidebar-user-status-dot" />
          </div>
          <div className="sidebar-user-meta">
            <span className="sidebar-user-name">{user.username}</span>
            {voiceConnection ? (
              <span className="sidebar-user-status in-voice">
                <InVoiceIcon />
                In voice
              </span>
            ) : (
              <span className="sidebar-user-status">Online</span>
            )}
          </div>
        </button>

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
            title="Server settings"
            aria-label="Server settings"
            disabled={!serverName}
            onClick={onOpenServerSettings}
          >
            <GearIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
