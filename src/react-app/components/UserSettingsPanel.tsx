import { useState } from "react";
import BotDeveloperTab from "./BotDeveloperTab";
import ProfileSettingsTab from "./ProfileSettingsTab";
import PrivacySettingsTab from "./PrivacySettingsTab";

type UserSettingsTab = "profile" | "privacy" | "developer";

interface UserSettingsPanelProps {
  onClose: () => void;
}

const TABS: { id: UserSettingsTab; label: string }[] = [
  { id: "profile", label: "My Profile" },
  { id: "privacy", label: "Privacy & Safety" },
  { id: "developer", label: "Developer" },
];

export default function UserSettingsPanel({ onClose }: UserSettingsPanelProps) {
  const [tab, setTab] = useState<UserSettingsTab>("profile");

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="user-settings-panel user-settings-panel-tabs"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="user-settings-title"
      >
        <header className="user-settings-header">
          <h2 id="user-settings-title">User Settings</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="user-settings-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="user-settings-content">
          {tab === "profile" && <ProfileSettingsTab />}
          {tab === "privacy" && <PrivacySettingsTab />}
          {tab === "developer" && <BotDeveloperTab />}
        </div>
      </div>
    </div>
  );
}
