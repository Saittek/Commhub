import ProfileSettingsTab from "./ProfileSettingsTab";

interface UserSettingsPanelProps {
  onClose: () => void;
}

export default function UserSettingsPanel({ onClose }: UserSettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="user-settings-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="user-settings-title"
      >
        <header className="user-settings-header">
          <h2 id="user-settings-title">My Profile</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="user-settings-content">
          <ProfileSettingsTab />
        </div>
      </div>
    </div>
  );
}
