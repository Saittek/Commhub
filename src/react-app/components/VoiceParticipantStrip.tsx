import type { VoicePeer } from "../lib/voice-client";
import UserAvatar from "./UserAvatar";

interface VoiceParticipantStripProps {
  peers: VoicePeer[];
  localSpeaking: boolean;
  localMuted: boolean;
  localDeafened: boolean;
  currentUsername: string;
  currentAvatarUrl?: string | null;
}

export default function VoiceParticipantStrip({
  peers,
  localSpeaking,
  localMuted,
  localDeafened,
  currentUsername,
  currentAvatarUrl,
}: VoiceParticipantStripProps) {
  const speakingCount =
    (localSpeaking ? 1 : 0) + peers.filter((peer) => peer.speaking && !peer.deafened).length;

  return (
    <div className="voice-participant-strip" aria-label="Voice participants">
      <div className="voice-participant-strip-avatars">
        <div
          className={`voice-participant-chip${localSpeaking ? " speaking" : ""}`}
          title={`You${localMuted ? " (muted)" : ""}${localDeafened ? " (deafened)" : ""}`}
        >
          <UserAvatar username={currentUsername} avatarUrl={currentAvatarUrl ?? null} size="reply" />
          <span className="voice-participant-chip-name">You</span>
        </div>
        {peers.map((peer) => (
          <div
            key={peer.userId}
            className={`voice-participant-chip${peer.speaking && !peer.deafened ? " speaking" : ""}`}
            title={`${peer.displayName}${peer.muted || peer.serverMuted ? " (muted)" : ""}`}
          >
            <span className="voice-participant-chip-initials">
              {peer.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span className="voice-participant-chip-name">{peer.displayName}</span>
          </div>
        ))}
      </div>
      <span className="voice-participant-strip-meta">
        {peers.length + 1} connected
        {speakingCount > 0 ? ` · ${speakingCount} speaking` : ""}
      </span>
    </div>
  );
}
