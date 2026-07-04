import { useNavigate } from "react-router-dom";
import ChannelList from "./ChannelList";
import ServerDial from "./ServerDial";
import SidebarUserPanel from "./SidebarUserPanel";
import { CommhubIcon } from "./ServerIcons";
import type { JoinedVoiceChannel } from "../context/VoiceContext";
import type { Channel, Server, User } from "../lib/api";

interface ServerSidebarProps {
  servers: Server[];
  activeServerId: string | null;
  channels: Channel[];
  activeChannelId: string | null;
  connectedVoiceChannelId: string | null;
  voiceConnection: JoinedVoiceChannel | null;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  user: User | null;
  onDisconnectVoice: () => void;
  onToggleVoiceMute: () => void;
  onToggleVoiceDeafen: () => void;
  onOpenUserSettings: () => void;
  onOpenMicSettings: () => void;
  onOpenHeadphoneSettings: () => void;
  onOpenServerSettings: () => void;
  onSelectServer: (serverId: string) => void;
  onServerCreated: (server: Server) => void;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelDeleted: (channelId: string) => void;
}

export default function ServerSidebar({
  servers,
  activeServerId,
  channels,
  activeChannelId,
  connectedVoiceChannelId,
  voiceConnection,
  onDisconnectVoice,
  voiceMuted,
  voiceDeafened,
  user,
  onToggleVoiceMute,
  onToggleVoiceDeafen,
  onOpenUserSettings,
  onOpenMicSettings,
  onOpenHeadphoneSettings,
  onOpenServerSettings,
  onSelectServer,
  onServerCreated,
  onSelectChannel,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
}: ServerSidebarProps) {
  const navigate = useNavigate();
  const activeServer =
    servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;

  return (
    <div className="server-sidebar">
      <div className="server-sidebar-brand">
        <span className="server-sidebar-brand-icon">
          <CommhubIcon size={16} />
        </span>
        <span>CommHub</span>
      </div>

      {activeServer && (
        <ServerDial
          servers={servers}
          activeServerId={activeServer.id}
          onSelectServer={onSelectServer}
          onServerCreated={onServerCreated}
        />
      )}

      {activeServer && (
        <div className="server-sidebar-channels">
          <header className="server-sidebar-channels-header">{activeServer.name}</header>
          <ChannelList
            serverId={activeServer.id}
            channels={channels}
            activeChannelId={activeChannelId}
            connectedVoiceChannelId={connectedVoiceChannelId}
            onSelectChannel={onSelectChannel}
            onChannelCreated={onChannelCreated}
            onChannelUpdated={onChannelUpdated}
            onChannelDeleted={onChannelDeleted}
          />
        </div>
      )}

      <div className="server-sidebar-join">
        <button
          type="button"
          className="server-action-button"
          onClick={() => navigate("/onboarding", { state: { mode: "join" } })}
        >
          <span className="server-action-icon">⌕</span>
          Join
        </button>
      </div>

      {user && (
        <SidebarUserPanel
          user={user}
          voiceConnection={voiceConnection}
          serverName={activeServer?.name ?? null}
          voiceMuted={voiceMuted}
          voiceDeafened={voiceDeafened}
          onToggleVoiceMute={onToggleVoiceMute}
          onToggleVoiceDeafen={onToggleVoiceDeafen}
          onDisconnectVoice={onDisconnectVoice}
          onOpenUserSettings={onOpenUserSettings}
          onOpenMicSettings={onOpenMicSettings}
          onOpenHeadphoneSettings={onOpenHeadphoneSettings}
          onOpenServerSettings={onOpenServerSettings}
        />
      )}
    </div>
  );
}
