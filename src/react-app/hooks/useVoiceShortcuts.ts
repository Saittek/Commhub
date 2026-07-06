import { useEffect } from "react";

interface VoiceShortcutsOptions {
  enabled: boolean;
  pushToTalk: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onPushToTalkChange: (active: boolean) => void;
}

export function useVoiceShortcuts({
  enabled,
  pushToTalk,
  onToggleMute,
  onToggleDeafen,
  onPushToTalkChange,
}: VoiceShortcutsOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.code === "KeyM") {
        event.preventDefault();
        onToggleMute();
        return;
      }

      if (event.ctrlKey && event.shiftKey && event.code === "KeyD") {
        event.preventDefault();
        onToggleDeafen();
        return;
      }

      if (pushToTalk && event.code === "Space" && !event.repeat) {
        event.preventDefault();
        onPushToTalkChange(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (pushToTalk && event.code === "Space") {
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
  }, [enabled, pushToTalk, onToggleMute, onToggleDeafen, onPushToTalkChange]);
}
