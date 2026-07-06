import { useEffect, useMemo, useRef, useState } from "react";
import { startActivity } from "../lib/api";
import { getVoiceVideoPreferences } from "../lib/voice-video-settings";
import TextChannelPanel from "./TextChannelPanel";
import type { LocalVoiceMedia, RemoteVoiceMedia, VoiceConnectionState, VoicePeer } from "../lib/voice-client";
import { useVoice } from "../context/VoiceContext";
import { useVoiceShortcuts } from "../hooks/useVoiceShortcuts";
import VoiceInviteModal from "./VoiceInviteModal";
import VoiceParticipantStrip from "./VoiceParticipantStrip";
import VoiceVideoTile from "./VoiceVideoTile";
import WatchTogetherModal from "./WatchTogetherModal";

interface VoiceStageViewProps {
  serverId: string;
  serverName: string;
  channelId: string;
  voiceChannelName: string;
  inviteCode?: string;
  voicePttOnly?: boolean;
  localMedia: LocalVoiceMedia;
  remoteMedia: RemoteVoiceMedia[];
  peers: VoicePeer[];
  localSpeaking: boolean;
  muted: boolean;
  deafened: boolean;
  currentUserId: string;
  currentUsername: string;
  currentAvatarUrl?: string | null;
  connectionState: VoiceConnectionState;
  voiceError?: string | null;
  onOpenDm: () => void;
  onRetryConnection?: () => void;
  onOpenMicSettings?: () => void;
  onOpenCameraSettings?: () => void;
  textChannel?: {
    channelId: string;
    channelName: string;
    channelTopic?: string | null;
    slowModeSeconds?: number;
  } | null;
}

type VideoTile =
  | {
      type: "stream";
      key: string;
      stream: MediaStream;
      label: string;
      mirrored?: boolean;
      variant: "camera" | "screen";
    }
  | { type: "empty"; key: string };

function hasRemoteVideoStreams(remoteMedia: RemoteVoiceMedia[]): boolean {
  return remoteMedia.some((item) => item.cameraStream || item.screenStream);
}

function buildVideoTiles(
  localMedia: LocalVoiceMedia,
  remoteMedia: RemoteVoiceMedia[],
  displayName: string,
  showEmptySlot: boolean,
): VideoTile[] {
  const tiles: VideoTile[] = [];

  if (localMedia.screenStream) {
    tiles.push({
      type: "stream",
      key: "local-screen",
      stream: localMedia.screenStream,
      label: displayName,
      variant: "screen",
    });
  }
  if (localMedia.cameraStream) {
    tiles.push({
      type: "stream",
      key: "local-camera",
      stream: localMedia.cameraStream,
      label: displayName,
      mirrored: true,
      variant: "camera",
    });
  }

  for (const item of remoteMedia) {
    if (item.screenStream) {
      tiles.push({
        type: "stream",
        key: `${item.userId}-screen`,
        stream: item.screenStream,
        label: item.displayName,
        variant: "screen",
      });
    }
    if (item.cameraStream) {
      tiles.push({
        type: "stream",
        key: `${item.userId}-camera`,
        stream: item.cameraStream,
        label: item.displayName,
        variant: "camera",
      });
    }
  }

  if (showEmptySlot) {
    tiles.push({ type: "empty", key: "empty" });
  }

  return tiles;
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 5h5V3H3v7h2V5m14 0v5h2V3h-7v2h5M5 19v-5H3v7h7v-2H5m14 5h-5v2h7v-7h-2v5Z"
      />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14 14h6v2h-8v-8h2v6M10 10H4V8h8v8h-2v-6Z"
      />
    </svg>
  );
}

function PopOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7Z"
      />
    </svg>
  );
}

function ParticipantsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5"
      />
    </svg>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {muted ? (
        <path
          fill="currentColor"
          d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28m-1.9 0c0-1.71-1.39-3.1-3.1-3.1S9 9.29 9 11v.1L15.9 18V11M4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5v-2h2.18L4.27 3M12 4c-1.66 0-3 1.34-3 3v3.76l3 3V7c0-.55.45-1 1-1s1 .45 1 1v4.76l1.24 1.24C13.44 14.97 13.22 15 13 15c-1.66 0-3-1.34-3-3v-.18l-1.3-1.3C8.16 11.43 8 10.74 8 10H6.2L12 15.8V4Z"
        />
      ) : (
        <path
          fill="currentColor"
          d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3m5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20h-2v2h6v-2h-2v-3.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14"
        />
      )}
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {off ? (
        <path
          fill="currentColor"
          d="M3.27 2 2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.55-.18L19.73 22 21 20.73 3.27 2M16 10.18V6c0-.55-.45-1-1-1H9.82l2 2H15c.55 0 1 .45 1 1v3.18l2 2V10.18M16 16H4V8h1.82L16 16.18V16m6-6v3.11l2 2V11c0-1.1-.9-2-2-2h-1.58l1.55 1.55c.63.21 1.03.84 1.03 1.45"
        />
      ) : (
        <path
          fill="currentColor"
          d="M17 10.5V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z"
        />
      )}
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4M4 6h16v10H4V6"
      />
    </svg>
  );
}

function ActivitiesIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="currentColor" d="M4 6h4v4H4V6m6 0h4v4h-4V6m6 0h4v4h-4V6M4 12h4v4H4v-4m6 0h4v4h-4v-4m6 0h4v4h-4v-4M4 18h4v2H4v-2m6 0h4v2h-4v-2m6 0h4v2h-4v-2Z" />
    </svg>
  );
}

function PhoneLeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .55-.45 1-1 1H4v3h2.4c.55 0 1 .45 1 1v1.6c1.45.47 3 .72 4.6.72s3.15-.25 4.6-.72V18c0-.55.45-1 1-1H20v-3h-2.4c-.55 0-1-.45-1-1v-3.1A9.96 9.96 0 0 0 12 9m0 2c1.39 0 2.68.3 3.86.82l.14.07v2.11l-.14.07A9.86 9.86 0 0 1 12 15c-1.39 0-2.68-.3-3.86-.82l-.14-.07v-2.11l.14-.07A9.86 9.86 0 0 1 12 11"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m-8 0c2.21 0 4-1.79 4-4S9.21 4 7 4 3 5.79 3 8s1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V20h6v-2.5c0-2.33-4.67-3.5-7-3.5"
      />
    </svg>
  );
}

export default function VoiceStageView({
  serverId,
  serverName,
  channelId,
  voiceChannelName,
  inviteCode,
  voicePttOnly = false,
  localMedia,
  remoteMedia,
  peers,
  localSpeaking,
  muted,
  deafened,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  connectionState,
  voiceError,
  onOpenDm,
  onRetryConnection,
  onOpenMicSettings,
  onOpenCameraSettings,
  textChannel,
}: VoiceStageViewProps) {
  const voice = useVoice();
  const stageRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [textDockOpen, setTextDockOpen] = useState(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [startingActivity, setStartingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const userVoicePrefs = getVoiceVideoPreferences();
  const pttActive = voicePttOnly || userVoicePrefs.pushToTalk;
  const cameraOn = localMedia.cameraEnabled;
  const screenOn = localMedia.screenSharing;

  useVoiceShortcuts({
    enabled: true,
    pushToTalk: pttActive,
    onToggleMute: voice.toggleMute,
    onToggleDeafen: voice.toggleDeafen,
    onPushToTalkChange: voice.setPushToTalk,
  });

  const someoneElseHasVideo = hasRemoteVideoStreams(remoteMedia);
  const showEmptySlot = !someoneElseHasVideo;
  const tiles = useMemo(
    () => buildVideoTiles(localMedia, remoteMedia, currentUsername, showEmptySlot),
    [localMedia, remoteMedia, currentUsername, showEmptySlot],
  );

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    const node = stageRef.current;
    if (!node) {
      return;
    }

    if (document.fullscreenElement === node) {
      await document.exitFullscreen();
      return;
    }

    await node.requestFullscreen();
  }

  async function handleStartWatchTogether() {
    setStartingActivity(true);
    setActivityError(null);
    try {
      await startActivity(serverId, {
        channelId,
        type: "watch",
        name: "Watch Together",
      });
      setActivitiesOpen(false);
      setWatchTogetherOpen(true);
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Could not start activity.");
    } finally {
      setStartingActivity(false);
    }
  }

  return (
    <div
      ref={stageRef}
      className={`voice-call-view${isFullscreen ? " voice-call-view--fullscreen" : ""}`}
      aria-label={`Video call in ${voiceChannelName}`}
    >
      {(connectionState === "connecting" || connectionState === "error") && (
        <div className={`voice-call-status-banner voice-call-status-banner--${connectionState}`}>
          <span>
            {connectionState === "connecting"
              ? "Connecting to voice..."
              : voiceError ?? "Voice connection failed."}
          </span>
          {connectionState === "error" && onRetryConnection && (
            <button type="button" className="secondary-button" onClick={() => void onRetryConnection()}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className={`voice-call-stage${textDockOpen && textChannel ? " voice-call-stage--with-chat" : ""}`}>
        <div className="voice-call-tiles">
          {tiles.map((tile) => {
            if (tile.type === "empty") {
              return (
                <div key={tile.key} className="voice-call-empty-tile">
                  <div className="voice-call-empty-art" aria-hidden="true">
                    <span className="voice-call-empty-gem" />
                    <span className="voice-call-empty-trophy" />
                  </div>
                  <div className="voice-call-empty-actions">
                    <p className="voice-call-empty-hint">
                      {peers.length > 0
                        ? `Waiting for others to turn on video (${peers.length + 1} in channel)`
                        : "Invite someone or turn on your camera to get started"}
                    </p>
                    {peers.length > 0 && (
                      <div className="voice-call-empty-peers">
                        <span className="voice-call-empty-peer you">You</span>
                        {peers.map((peer) => (
                          <span key={peer.userId} className="voice-call-empty-peer">
                            {peer.displayName}
                          </span>
                        ))}
                      </div>
                    )}
                    <button type="button" className="voice-call-empty-btn" onClick={() => setInviteModalOpen(true)}>
                      <InviteIcon />
                      Invite to Voice
                    </button>
                    <button
                      type="button"
                      className="voice-call-empty-btn"
                      onClick={() => setActivitiesOpen(true)}
                    >
                      <ActivitiesIcon />
                      Choose Activity
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <VoiceVideoTile
                key={tile.key}
                stream={tile.stream}
                label={tile.label}
                mirrored={tile.mirrored}
                variant={tile.variant}
              />
            );
          })}
        </div>
      </div>

      {textChannel && (
        <div className={`voice-call-text-dock${textDockOpen ? " open" : ""}`}>
          <button
            type="button"
            className="voice-call-text-dock-toggle"
            onClick={() => setTextDockOpen((open) => !open)}
          >
            {textDockOpen ? "Hide chat" : `# ${textChannel.channelName}`}
          </button>
          {textDockOpen && (
            <div className="voice-call-text-dock-panel">
              <TextChannelPanel
                serverId={serverId}
                channelId={textChannel.channelId}
                channelName={textChannel.channelName}
                channelTopic={textChannel.channelTopic}
                slowModeSeconds={textChannel.slowModeSeconds ?? 0}
                currentUserId={currentUserId}
                embedded
              />
            </div>
          )}
        </div>
      )}

      <div className="voice-call-corner voice-call-corner--left">
        <button
          type="button"
          className={`voice-call-corner-btn${participantsOpen ? " active" : ""}`}
          title="Show participants"
          aria-expanded={participantsOpen}
          onClick={() => setParticipantsOpen((open) => !open)}
        >
          <ParticipantsIcon />
        </button>
      </div>

      <div className="voice-call-corner voice-call-corner--right">
        <button type="button" className="voice-call-corner-btn" title="Open DMs" onClick={onOpenDm}>
          <PopOutIcon />
        </button>
        <button
          type="button"
          className="voice-call-corner-btn"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          onClick={() => void toggleFullscreen()}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>

      {participantsOpen && (
        <div className="voice-call-participants-panel">
          <VoiceParticipantStrip
            peers={peers}
            localSpeaking={localSpeaking}
            localMuted={muted}
            localDeafened={deafened}
            currentUsername={currentUsername}
            currentAvatarUrl={currentAvatarUrl}
          />
        </div>
      )}

      {activitiesOpen && (
        <div className="settings-overlay app-modal-overlay--inset" onClick={() => setActivitiesOpen(false)}>
          <div
            className="channel-settings-modal"
            role="dialog"
            aria-label="Activities"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="channel-settings-header">
              <h2>Activities</h2>
              <button
                type="button"
                className="settings-close"
                onClick={() => setActivitiesOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {activityError && <div className="settings-error app-modal-error">{activityError}</div>}
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
              <button type="button" className="secondary-button" onClick={() => setActivitiesOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {watchTogetherOpen && (
        <WatchTogetherModal
          serverId={serverId}
          channelId={channelId}
          onClose={() => setWatchTogetherOpen(false)}
        />
      )}

      {inviteModalOpen && (
        <VoiceInviteModal
          serverId={serverId}
          serverName={serverName}
          channelId={channelId}
          channelName={voiceChannelName}
          inviteCode={inviteCode}
          currentUserId={currentUserId}
          excludeUserIds={peers.map((peer) => peer.userId)}
          onClose={() => setInviteModalOpen(false)}
        />
      )}

      <div className={`voice-call-bottom-bar${someoneElseHasVideo ? "" : " voice-call-bottom-bar--controls-only"}`}>
        {someoneElseHasVideo && (
          <div className="voice-call-rail-actions">
            <button type="button" className="voice-call-rail-btn" onClick={() => setInviteModalOpen(true)}>
              <InviteIcon />
              Invite to Voice
            </button>
            <button type="button" className="voice-call-rail-btn" onClick={() => setActivitiesOpen(true)}>
              <ActivitiesIcon />
              Choose Activity
            </button>
          </div>
        )}

        <div className="voice-call-controls" role="toolbar" aria-label="Call controls">
          <div className="voice-call-control-group">
            <button
              type="button"
              className={`voice-call-control-btn${muted ? " muted" : ""}`}
              title={muted ? "Unmute" : "Mute"}
              onClick={voice.toggleMute}
            >
              <MicIcon muted={muted} />
            </button>
            <button
              type="button"
              className="voice-call-control-chevron"
              title="Microphone settings"
              aria-label="Microphone settings"
              onClick={onOpenMicSettings}
            >
              <ChevronDownIcon />
            </button>
          </div>

          <div className="voice-call-control-group">
            <button
              type="button"
              className={`voice-call-control-btn${cameraOn ? " active" : ""}`}
              title={cameraOn ? "Turn off camera" : "Turn on camera"}
              onClick={() => void voice.toggleCamera()}
            >
              <CameraIcon off={!cameraOn} />
            </button>
            <button
              type="button"
              className="voice-call-control-chevron"
              title="Camera settings"
              aria-label="Camera settings"
              onClick={onOpenCameraSettings}
            >
              <ChevronDownIcon />
            </button>
          </div>

          <button
            type="button"
            className={`voice-call-control-btn${screenOn ? " active" : ""}`}
            title={screenOn ? "Stop sharing" : "Share screen"}
            onClick={() => void voice.toggleScreenShare()}
          >
            <ScreenShareIcon />
          </button>

          <button
            type="button"
            className="voice-call-control-btn"
            title="Activities"
            onClick={() => setActivitiesOpen(true)}
          >
            <ActivitiesIcon />
          </button>

          <button
            type="button"
            className="voice-call-control-btn voice-call-control-btn--leave"
            title="Disconnect"
            onClick={voice.disconnect}
          >
            <PhoneLeaveIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
