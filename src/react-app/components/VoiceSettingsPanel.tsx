import VoiceVideoSettingsTab, { type VoiceSettingsFocus } from "./VoiceVideoSettingsTab";

interface VoiceSettingsPanelProps {
  focus?: VoiceSettingsFocus;
  onClose: () => void;
}

export default function VoiceSettingsPanel({ focus, onClose }: VoiceSettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="user-settings-panel voice-settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="voice-settings-title"
      >
        <header className="user-settings-header">
          <h2 id="voice-settings-title">Voice & Video</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="user-settings-content">
          <VoiceVideoSettingsTab focus={focus} />
        </div>
      </div>
    </div>
  );
}
