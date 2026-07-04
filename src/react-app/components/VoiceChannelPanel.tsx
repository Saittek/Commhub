import { useEffect } from "react";
import type { Channel } from "../lib/api";
import { getVoiceVideoPreferences } from "../lib/voice-video-settings";
import type { JoinedVoiceChannel } from "../context/VoiceContext";
import type {
  LocalVoiceMedia,
  RemoteVoiceMedia,
  VoiceConnectionState,
  VoicePeer,
} from "../lib/voice-client";
import VoiceVideoTile from "./VoiceVideoTile";

interface VoiceChannelPanelProps {
  channel: Channel;
  connectionState: VoiceConnectionState;
  error: string | null;
  peers: VoicePeer[];
  muted: boolean;
  deafened: boolean;
  localMedia: LocalVoiceMedia;
  remoteMedia: RemoteVoiceMedia[];
  isJoined: boolean;
  joinedElsewhere: JoinedVoiceChannel | null;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onPushToTalkChange: (active: boolean) => void;
  onClearError: () => void;
}

export default function VoiceChannelPanel({
  channel,
  connectionState,
  error,
  peers,
  muted,
  deafened,
  localMedia,
  remoteMedia,
  isJoined,
  joinedElsewhere,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
  onPushToTalkChange,
  onClearError,
}: VoiceChannelPanelProps) {
  const userVoicePrefs = getVoiceVideoPreferences();
  const pttOnly = (channel.voicePttOnly ?? false) || userVoicePrefs.pushToTalk;

  useEffect(() => {
    if (!isJoined || !pttOnly) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        onPushToTalkChange(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        onPushToTalkChange(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      onPushToTalkChange(false);
    };
  }, [isJoined, pttOnly, onPushToTalkChange]);

  const qualityLabel =
    channel.voiceBitrate === 96000 ? "High" : channel.voiceBitrate === 32000 ? "Low" : "Standard";
  const bitrateKbps = Math.round((channel.voiceBitrate ?? 64000) / 1000);
  const hasVideo =
    localMedia.cameraEnabled ||
    localMedia.screenSharing ||
    remoteMedia.some((item) => item.cameraStream || item.screenStream);

  function peerStatus(peer: VoicePeer) {
    if (peer.deafened) {
      return "Deafened";
    }
    if (peer.muted) {
      return "Muted";
    }
    if (peer.screenSharing && peer.cameraEnabled) {
      return "Sharing screen + camera";
    }
    if (peer.screenSharing) {
      return "Sharing screen";
    }
    if (peer.cameraEnabled) {
      return "On camera";
    }
    if (peer.speaking) {
      return "Speaking";
    }
    return "Connected";
  }

  function localStatus() {
    if (deafened) {
      return "Deafened";
    }
    if (muted) {
      return "Muted";
    }
    if (localMedia.screenSharing && localMedia.cameraEnabled) {
      return "Sharing screen + camera";
    }
    if (localMedia.screenSharing) {
      return "Sharing screen";
    }
    if (localMedia.cameraEnabled) {
      return "On camera";
    }
    return "Live";
  }

  return (
    <div className="voice-channel-panel">
      <div className="voice-channel-hero">
        <div className="voice-channel-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="42" height="42">
            <path
              fill="currentColor"
              d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm-1 12.73V18H8v2h8v-2h-3v-2.27A7.01 7.01 0 0 0 19 11h-2a5 5 0 0 1-10 0H5a7.01 7.01 0 0 0 6 4.73z"
            />
          </svg>
        </div>
        <div>
          <h2>{channel.name}</h2>
          <p className="settings-muted">
            {qualityLabel} quality (Opus {bitrateKbps} kbps)
            {channel.voiceUserLimit ? ` · ${channel.voiceUserLimit} user max` : " · No user limit"}
            {pttOnly ? " · Push-to-talk" : " · Voice activity"}
          </p>
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      {!isJoined ? (
        <div className="voice-channel-join">
          {joinedElsewhere ? (
            <p>
              You are connected to <strong>{joinedElsewhere.channelName}</strong>
              {joinedElsewhere.serverName ? ` in ${joinedElsewhere.serverName}` : ""}. Disconnect
              from that channel before joining here.
            </p>
          ) : (
            <p>
              Join this voice channel to talk with other members using your microphone.
            </p>
          )}
          <button
            type="button"
            className="voice-join-button"
            onClick={() => {
              onClearError();
              onJoin();
            }}
            disabled={connectionState === "connecting" || Boolean(joinedElsewhere)}
          >
            {connectionState === "connecting" ? "Connecting..." : "Join Voice"}
          </button>
        </div>
      ) : (
        <>
          <div className="voice-controls">
            <button
              type="button"
              className={muted ? "voice-control active" : "voice-control"}
              onClick={onToggleMute}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              className={deafened ? "voice-control active" : "voice-control"}
              onClick={onToggleDeafen}
              title={deafened ? "Undeafen" : "Deafen"}
            >
              {deafened ? "Undeafen" : "Deafen"}
            </button>
            <button
              type="button"
              className={localMedia.cameraEnabled ? "voice-control video-active" : "voice-control"}
              onClick={onToggleCamera}
              title={localMedia.cameraEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {localMedia.cameraEnabled ? "Stop Camera" : "Camera"}
            </button>
            <button
              type="button"
              className={localMedia.screenSharing ? "voice-control video-active" : "voice-control"}
              onClick={onToggleScreenShare}
              title={localMedia.screenSharing ? "Stop sharing" : "Share screen"}
            >
              {localMedia.screenSharing ? "Stop Share" : "Share Screen"}
            </button>
            <button type="button" className="voice-control leave" onClick={onLeave}>
              Disconnect
            </button>
          </div>

          {hasVideo && (
            <div className="voice-video-stage">
              <h3>Video</h3>
              <div className="voice-video-grid">
                {localMedia.cameraStream && (
                  <VoiceVideoTile stream={localMedia.cameraStream} label="You · Camera" mirrored />
                )}
                {localMedia.screenStream && (
                  <VoiceVideoTile stream={localMedia.screenStream} label="You · Screen" />
                )}
                {remoteMedia.map((item) => (
                  <div key={item.userId} className="voice-remote-media-group">
                    {item.screenStream && (
                      <VoiceVideoTile
                        stream={item.screenStream}
                        label={`${item.displayName} · Screen`}
                      />
                    )}
                    {item.cameraStream && (
                      <VoiceVideoTile
                        stream={item.cameraStream}
                        label={`${item.displayName} · Camera`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pttOnly && (
            <p className="voice-ptt-hint settings-muted">
              Hold <strong>Space</strong> to talk.
            </p>
          )}

          <div className="voice-participants">
            <h3>Connected ({peers.length + 1})</h3>
            <div className="voice-participant-list">
              <div className="voice-participant you">
                <span className="voice-participant-avatar">You</span>
                <span className="voice-participant-name">You</span>
                <span className="voice-participant-status">{localStatus()}</span>
              </div>
              {peers.map((peer) => (
                <div
                  key={peer.userId}
                  className={peer.speaking ? "voice-participant speaking" : "voice-participant"}
                >
                  <span className="voice-participant-avatar">
                    {peer.displayName.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="voice-participant-name">{peer.displayName}</span>
                  <span className="voice-participant-status">{peerStatus(peer)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
