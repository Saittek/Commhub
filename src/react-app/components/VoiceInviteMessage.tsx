import { parseVoiceInvite, stripVoiceInviteMarker } from "../lib/voice-invite";

interface VoiceInviteMessageProps {
  content: string;
  joining?: boolean;
  onJoin: (serverId: string, channelId: string) => void;
}

export default function VoiceInviteMessage({
  content,
  joining = false,
  onJoin,
}: VoiceInviteMessageProps) {
  const invite = parseVoiceInvite(content);
  const displayText = stripVoiceInviteMarker(content);

  if (!invite) {
    return null;
  }

  return (
    <div className="voice-invite-message">
      <p className="voice-invite-message-text">{displayText}</p>
      <button
        type="button"
        className="primary-button primary-button--compact"
        disabled={joining}
        onClick={() => onJoin(invite.serverId, invite.channelId)}
      >
        {joining ? "Joining..." : "Join Voice"}
      </button>
    </div>
  );
}
