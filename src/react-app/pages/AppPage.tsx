import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ServerSidebar from "../components/ServerSidebar";
import ServerSettingsPanel from "../components/ServerSettingsPanel";
import TextChannelPanel from "../components/TextChannelPanel";
import UserSettingsPanel from "../components/UserSettingsPanel";
import VoiceSettingsPanel from "../components/VoiceSettingsPanel";
import type { VoiceSettingsFocus } from "../components/VoiceVideoSettingsTab";
import VoiceChannelPanel from "../components/VoiceChannelPanel";
import { useAuth } from "../context/AuthContext";
import { useVoice } from "../context/VoiceContext";
import { getMyServers, getServerChannels, type Channel, type Server } from "../lib/api";
import { resolveHomePath } from "../lib/navigation";

export default function AppPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [voiceSettingsFocus, setVoiceSettingsFocus] = useState<VoiceSettingsFocus | undefined>(
    undefined,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeServer = servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const activeChannel =
    channels.find((channel) => channel.id === activeChannelId) ?? channels[0] ?? null;

  const voice = useVoice();

  async function loadChannels(serverId: string, preferredChannelId?: string) {
    try {
      setLoadError(null);
      const response = await getServerChannels(serverId);
      setChannels(response.channels);

      if (response.channels.length === 0) {
        setActiveChannelId(null);
        return;
      }

      const nextId =
        preferredChannelId &&
        response.channels.some((channel) => channel.id === preferredChannelId)
          ? preferredChannelId
          : response.channels[0]?.id ?? null;

      setActiveChannelId(nextId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load channels.");
    }
  }

  async function reloadServers(preferredId?: string) {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await getMyServers();
      setServers(response.servers);

      if (response.servers.length === 0) {
        setActiveServerId(null);
        setChannels([]);
        setActiveChannelId(null);
        navigate(await resolveHomePath());
        return;
      }

      const nextId =
        preferredId && response.servers.some((server) => server.id === preferredId)
          ? preferredId
          : response.servers[0]?.id ?? null;

      setActiveServerId(nextId);
      if (nextId) {
        await loadChannels(nextId);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load servers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadServers();
  }, []);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }

    void loadChannels(activeServerId);
  }, [activeServerId]);

  function handleServerSelect(serverId: string) {
    setActiveServerId(serverId);
  }

  function handleServerCreated(server: Server) {
    setServers((current) => {
      if (current.some((item) => item.id === server.id)) {
        return current;
      }
      return [...current, server];
    });
    setActiveServerId(server.id);
    void loadChannels(server.id);
  }

  function handleChannelCreated(channel: Channel) {
    setChannels((current) => [...current, channel]);
    setActiveChannelId(channel.id);
  }

  function handleChannelUpdated(channel: Channel) {
    setChannels((current) =>
      current.map((item) => (item.id === channel.id ? channel : item)),
    );
  }

  function handleChannelDeleted(channelId: string) {
    if (voice.joined?.channelId === channelId) {
      voice.disconnect();
    }
    setChannels((current) => {
      const next = current.filter((item) => item.id !== channelId);
      if (activeChannelId === channelId) {
        setActiveChannelId(next[0]?.id ?? null);
      }
      return next;
    });
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <ServerSidebar
          servers={servers}
          activeServerId={activeServer?.id ?? null}
          channels={channels}
          activeChannelId={activeChannelId}
          connectedVoiceChannelId={
            voice.joined && voice.joined.serverId === activeServer?.id
              ? voice.joined.channelId
              : null
          }
          voiceConnection={voice.isJoined ? voice.joined : null}
          voiceMuted={voice.muted}
          voiceDeafened={voice.deafened}
          onDisconnectVoice={voice.disconnect}
          onToggleVoiceMute={voice.toggleMute}
          onToggleVoiceDeafen={voice.toggleDeafen}
          user={user}
          onOpenUserSettings={() => {
            setSettingsOpen(false);
            setVoiceSettingsOpen(false);
            setUserSettingsOpen(true);
          }}
          onOpenMicSettings={() => {
            setSettingsOpen(false);
            setUserSettingsOpen(false);
            setVoiceSettingsFocus("microphone");
            setVoiceSettingsOpen(true);
          }}
          onOpenHeadphoneSettings={() => {
            setSettingsOpen(false);
            setUserSettingsOpen(false);
            setVoiceSettingsFocus("headphones");
            setVoiceSettingsOpen(true);
          }}
          onOpenServerSettings={() => {
            setUserSettingsOpen(false);
            setVoiceSettingsOpen(false);
            setSettingsOpen(true);
          }}
          onSelectServer={handleServerSelect}
          onServerCreated={handleServerCreated}
          onSelectChannel={setActiveChannelId}
          onChannelCreated={handleChannelCreated}
          onChannelUpdated={handleChannelUpdated}
          onChannelDeleted={handleChannelDeleted}
        />
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div className="app-header-title">
            <h1>
              {activeChannel
                ? `${activeChannel.type === "text" ? "#" : ""}${activeChannel.name}`
                : (activeServer?.name ?? "Your Server")}
            </h1>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void logout();
            }}
          >
            Log Out
          </button>
        </header>

        <section
          className={
            activeChannel?.type === "text" ? "app-content text-channel-view" : "app-placeholder"
          }
        >
          {loading && <p>Loading server...</p>}
          {loadError && <div className="settings-error">{loadError}</div>}
          {!loading && activeChannel ? (
            activeChannel.type === "voice" ? (
              <VoiceChannelPanel
                channel={activeChannel}
                connectionState={voice.connectionState}
                error={voice.error}
                peers={voice.peers}
                muted={voice.muted}
                deafened={voice.deafened}
                localMedia={voice.localMedia}
                remoteMedia={voice.remoteMedia}
                isJoined={
                  voice.isJoined && voice.joined?.channelId === activeChannel.id
                }
                joinedElsewhere={
                  voice.isJoined && voice.joined?.channelId !== activeChannel.id
                    ? voice.joined
                    : null
                }
                onJoin={() => {
                  if (activeServer) {
                    void voice.join(activeServer, activeChannel);
                  }
                }}
                onLeave={voice.disconnect}
                onToggleMute={voice.toggleMute}
                onToggleDeafen={voice.toggleDeafen}
                onToggleCamera={() => {
                  void voice.toggleCamera();
                }}
                onToggleScreenShare={() => {
                  void voice.toggleScreenShare();
                }}
                onPushToTalkChange={voice.setPushToTalk}
                onClearError={voice.clearError}
              />
            ) : (
              user && (
                <TextChannelPanel
                  serverId={activeServer!.id}
                  channelId={activeChannel.id}
                  channelName={activeChannel.name}
                  currentUserId={user.id}
                />
              )
            )
          ) : !loading ? (
            <>
              <h2>Welcome to {activeServer?.name ?? "your server"}</h2>
              <p>
                Select a # text channel to chat, or join a voice channel to talk. Use the{" "}
                <strong>+</strong> buttons next to channel categories to create new ones.
              </p>
            </>
          ) : null}
        </section>
      </main>

      {userSettingsOpen && (
        <UserSettingsPanel
          onClose={() => {
            setUserSettingsOpen(false);
          }}
        />
      )}

      {voiceSettingsOpen && (
        <VoiceSettingsPanel
          focus={voiceSettingsFocus}
          onClose={() => {
            setVoiceSettingsOpen(false);
            setVoiceSettingsFocus(undefined);
          }}
        />
      )}

      {settingsOpen && activeServer && user && (
        <ServerSettingsPanel
          serverId={activeServer.id}
          currentUserId={user.id}
          onClose={() => setSettingsOpen(false)}
          onServerUpdated={(server) => {
            setServers((current) =>
              current.map((item) => (item.id === server.id ? { ...item, ...server } : item)),
            );
          }}
          onServerLeft={() => {
            if (voice.joined?.serverId === activeServer.id) {
              voice.disconnect();
            }
            void reloadServers();
          }}
        />
      )}
    </div>
  );
}
