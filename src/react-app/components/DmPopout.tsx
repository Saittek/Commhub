import { useEffect } from "react";
import FriendsDmPanel from "./FriendsDmPanel";

interface DmPopoutProps {
  open: boolean;
  onClose: () => void;
  onJoinVoiceInvite?: (serverId: string, channelId: string) => void;
  joiningVoiceInvite?: boolean;
}

export default function DmPopout({
  open,
  onClose,
  onJoinVoiceInvite,
  joiningVoiceInvite = false,
}: DmPopoutProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="dm-popout-overlay" onClick={onClose}>
      <div
        className="dm-popout"
        role="dialog"
        aria-label="Direct messages"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dm-popout-header">
          <h2>Direct Messages</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="dm-popout-body">
          <FriendsDmPanel
            onJoinVoiceInvite={onJoinVoiceInvite}
            joiningVoiceInvite={joiningVoiceInvite}
          />
        </div>
      </div>
    </div>
  );
}
