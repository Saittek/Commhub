import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChannelList from "./ChannelList";
import ServerDial from "./ServerDial";
import SidebarUserPanel from "./SidebarUserPanel";
import { CommhubIcon } from "./ServerIcons";
import { FriendsIcon } from "./UiIcons";
import type { JoinedVoiceChannel } from "../context/VoiceContext";
import { getMyPermissions, type Channel, type Server, type User } from "../lib/api";

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
  onServerJoined: (server: Server) => void;
  onSelectChannel: (channelId: string) => void;
  onChannelCreated: (channel: Channel) => void;
  onChannelUpdated: (channel: Channel) => void;
  onChannelDeleted: (channelId: string) => void;
  unreadCounts?: Record<string, number>;
  showFriends?: boolean;
  onToggleFriends?: () => void;
  onLogout?: () => void;
  voiceError?: string | null;
  onClearVoiceError?: () => void;
  onOpenDm?: () => void;
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
  onServerJoined,
  onSelectChannel,
  onChannelCreated,
  onChannelUpdated,
  onChannelDeleted,
  unreadCounts,
  showFriends,
  onToggleFriends,
  onLogout,
  voiceError,
  onClearVoiceError,
  onOpenDm,
}: ServerSidebarProps) {
  const navigate = useNavigate();
  const [canManageChannels, setCanManageChannels] = useState(false);
  const activeServer =
    servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;

  useEffect(() => {
    if (!activeServer) {
      setCanManageChannels(false);
      return;
    }
    void getMyPermissions(activeServer.id)
      .then((response) => {
        setCanManageChannels(
          Boolean(
            response.permissions.manage_channels ||
              response.permissions.administrator ||
              activeServer.ownerId === user?.id,
          ),
        );
      })
      .catch(() => setCanManageChannels(false));
  }, [activeServer, user?.id]);

  return (
    <div className="server-sidebar">
      <div className="server-sidebar-brand">
        <span className="server-sidebar-brand-icon">
          <CommhubIcon size={16} />
        </span>
        <span>CommHub</span>
        {onToggleFriends && (
          <button
            type="button"
            className={`friends-toggle-btn${showFriends ? " active" : ""}`}
            onClick={onToggleFriends}
            title="Friends & DMs"
            aria-label="Friends & DMs"
            aria-pressed={showFriends}
          >
            <FriendsIcon className="friends-toggle-icon" />
          </button>
        )}
      </div>

      {activeServer && (
        <ServerDial
          servers={servers}
          activeServerId={activeServer.id}
          onSelectServer={onSelectServer}
          onServerCreated={onServerCreated}
          onServerJoined={onServerJoined}
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
            unreadCounts={unreadCounts}
            canManage={canManageChannels}
            onSelectChannel={onSelectChannel}
            onChannelCreated={onChannelCreated}
            onChannelUpdated={onChannelUpdated}
            onChannelDeleted={onChannelDeleted}
          />
        </div>
      )}

      {user && (
        <SidebarUserPanel
          user={user}
          serverId={activeServer?.id ?? null}
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
          onJoinServer={() => navigate("/onboarding", { state: { mode: "join" } })}
          onLogout={onLogout}
          voiceError={voiceError}
          onClearVoiceError={onClearVoiceError}
          onOpenDm={onOpenDm}
        />
      )}
    </div>
  );
}
