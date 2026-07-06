import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { FriendsIcon, HashIcon } from "../components/UiIcons";
import ServerSidebar from "../components/ServerSidebar";
import FriendsDmPanel from "../components/FriendsDmPanel";
import ServerSettingsPanel from "../components/ServerSettingsPanel";
import TextChannelPanel from "../components/TextChannelPanel";
import VoiceStageView from "../components/VoiceStageView";
import UserSettingsPanel from "../components/UserSettingsPanel";
import VoiceSettingsPanel from "../components/VoiceSettingsPanel";
import type { VoiceSettingsFocus } from "../components/VoiceVideoSettingsTab";
import RulesAcceptModal from "../components/RulesAcceptModal";
import MembersPanel from "../components/MembersPanel";
import { useAuth } from "../context/AuthContext";
import { useVoice } from "../context/VoiceContext";
import { getMyServers, getServerChannels, getChannelUnread, getServerRules, type Channel, type Server } from "../lib/api";
import VoiceSetupModal, { VOICE_SETUP_DONE_KEY } from "../components/VoiceSetupModal";
import { resolveHomePath } from "../lib/navigation";
import { shouldShowVoiceStage } from "../lib/voice-stage";
import { getVoiceVideoPreferences } from "../lib/voice-video-settings";
import { useVoiceShortcuts } from "../hooks/useVoiceShortcuts";
import DmPopout from "../components/DmPopout";

function resolveTextChannelId(channels: Channel[], preferredId?: string | null): string | null {
  if (preferredId) {
    const preferred = channels.find((channel) => channel.id === preferredId);
    if (preferred?.type === "text") {
      return preferredId;
    }
  }
  return channels.find((channel) => channel.type === "text")?.id ?? null;
}

export default function AppPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showMembers, setShowMembers] = useState(true);
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [showFriends, setShowFriends] = useState(false);
  const [openDmUserId, setOpenDmUserId] = useState<string | null>(null);
  const [rulesGate, setRulesGate] = useState<{ serverId: string; serverName: string } | null>(null);
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
  const [dmPopoutOpen, setDmPopoutOpen] = useState(false);
  const [voiceSetupOpen, setVoiceSetupOpen] = useState(
    () => typeof window !== "undefined" && !localStorage.getItem(VOICE_SETUP_DONE_KEY),
  );
  const [joiningVoiceInvite, setJoiningVoiceInvite] = useState(false);

  const activeServer = servers.find((server) => server.id === activeServerId) ?? servers[0] ?? null;
  const activeTextChannel =
    channels.find((channel) => channel.id === activeChannelId && channel.type === "text") ?? null;

  const voice = useVoice();
  const inVoiceStage = shouldShowVoiceStage(voice);
  const voiceChannel = channels.find((channel) => channel.id === voice.joined?.channelId) ?? null;
  const pushToTalk =
    (voiceChannel?.voicePttOnly ?? false) || getVoiceVideoPreferences().pushToTalk;

  useVoiceShortcuts({
    enabled: Boolean(voice.joined) && voice.connectionState === "connected" && !inVoiceStage,
    pushToTalk,
    onToggleMute: voice.toggleMute,
    onToggleDeafen: voice.toggleDeafen,
    onPushToTalkChange: voice.setPushToTalk,
  });

  async function handleJoinVoiceInvite(serverId: string, channelId: string) {
    setJoiningVoiceInvite(true);
    setLoadError(null);
    try {
      setShowFriends(false);
      setDmPopoutOpen(false);

      let server = servers.find((item) => item.id === serverId);
      if (!server) {
        const response = await getMyServers();
        setServers(response.servers);
        server = response.servers.find((item) => item.id === serverId);
      }
      if (!server) {
        setLoadError("You are not a member of that server.");
        return;
      }

      setActiveServerId(serverId);
      const channelResponse = await getServerChannels(serverId);
      setChannels(channelResponse.channels);
      const channel = channelResponse.channels.find(
        (item) => item.id === channelId && item.type === "voice",
      );
      if (!channel) {
        setLoadError("That voice channel no longer exists.");
        return;
      }

      voice.clearError();
      await voice.join(server, channel);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not join voice.");
    } finally {
      setJoiningVoiceInvite(false);
    }
  }

  async function loadChannels(serverId: string, preferredChannelId?: string) {
    try {
      setLoadError(null);
      const response = await getServerChannels(serverId);
      setChannels(response.channels);

      if (response.channels.length === 0) {
        setActiveChannelId(null);
        return;
      }

      const nextId = resolveTextChannelId(response.channels, preferredChannelId);

      setActiveChannelId(nextId);
      void loadUnread(serverId);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load channels.");
    }
  }

  async function loadUnread(serverId: string) {
    try {
      const response = await getChannelUnread(serverId);
      setUnreadCounts(response.unread);
    } catch {
      setUnreadCounts({});
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

  useEffect(() => {
    if (!activeServerId || !activeServer) {
      setRulesGate(null);
      return;
    }
    void getServerRules(activeServerId).then((rules) => {
      if (rules.requireAcceptance && !rules.accepted) {
        setRulesGate({ serverId: activeServerId, serverName: activeServer.name });
      } else {
        setRulesGate(null);
      }
    });
  }, [activeServerId, activeServer?.name]);

  function handleServerSelect(serverId: string) {
    setShowFriends(false);
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
    if (channel.type === "text") {
      setActiveChannelId(channel.id);
    }
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
        setActiveChannelId(resolveTextChannelId(next));
      }
      return next;
    });
  }

  function handleServerJoined(server: Server) {
    handleServerCreated(server);
  }

  const showMembersPanel = Boolean(activeServer && !showFriends);
  const hideAppHeader = Boolean(activeTextChannel) && !showFriends && !inVoiceStage;
  const uiTextScale = (activeServer?.uiTextScale ?? 100) / 100;

  return (
    <div
      className={`app-shell${showMembersPanel && !showMembers ? " app-shell--members-collapsed" : ""}${inVoiceStage ? " app-shell--voice-stage" : ""}`}
      style={{ "--ch-ui-scale": String(uiTextScale) } as CSSProperties}
    >
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
          voiceConnection={voice.joined}
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
          onServerJoined={handleServerJoined}
          onSelectChannel={(channelId) => {
            setShowFriends(false);
            const channel = channels.find((item) => item.id === channelId);
            if (!channel) {
              return;
            }

            if (channel.type === "voice") {
              if (!activeServer) {
                return;
              }
              if (voice.joined?.channelId === channelId && voice.connectionState !== "disconnected") {
                voice.disconnect();
                return;
              }
              voice.clearError();
              void voice.join(activeServer, channel);
              return;
            }

            setActiveChannelId(channelId);
            setUnreadCounts((current) => ({ ...current, [channelId]: 0 }));
          }}
          voiceError={voice.error}
          onClearVoiceError={voice.clearError}
          onOpenDm={() => setDmPopoutOpen(true)}
          unreadCounts={unreadCounts}
          showFriends={showFriends}
          onToggleFriends={() => setShowFriends((v) => !v)}
          onChannelCreated={handleChannelCreated}
          onChannelUpdated={handleChannelUpdated}
          onChannelDeleted={handleChannelDeleted}
          onLogout={() => {
            void logout().then(() => navigate("/"));
          }}
        />
      </aside>

      <main className="app-main">
        {!hideAppHeader && (
        <header className="app-header">
          <div className="app-header-title">
            {showFriends ? (
              <>
                <FriendsIcon className="app-header-channel-icon" />
                <h1>Friends</h1>
              </>
            ) : activeTextChannel ? (
              <>
                <span className="app-header-channel-icon" aria-hidden="true">
                  <HashIcon />
                </span>
                <h1>{activeTextChannel.name}</h1>
              </>
            ) : (
              <h1>{activeServer?.name ?? "Your Server"}</h1>
            )}
          </div>
        </header>
        )}

        <section
          className={
            inVoiceStage
              ? "app-content voice-stage-content"
              : activeTextChannel
                ? "app-content text-channel-view"
                : "app-placeholder"
          }
        >
          {loading && <p>Loading server...</p>}
          {loadError && <div className="settings-error">{loadError}</div>}
          {!loading && showFriends ? (
            <FriendsDmPanel
              openDmUserId={openDmUserId}
              onOpenDmHandled={() => setOpenDmUserId(null)}
              onJoinVoiceInvite={(serverId, channelId) => void handleJoinVoiceInvite(serverId, channelId)}
              joiningVoiceInvite={joiningVoiceInvite}
            />
          ) : !loading && inVoiceStage && activeServer && user && voice.joined && voice.joined.serverId === activeServer.id ? (
            <VoiceStageView
              serverId={activeServer.id}
              serverName={activeServer.name}
              channelId={voice.joined.channelId}
              voiceChannelName={voice.joined.channelName}
              inviteCode={activeServer.inviteCode}
              voicePttOnly={voiceChannel?.voicePttOnly}
              localMedia={voice.localMedia}
              remoteMedia={voice.remoteMedia}
              peers={voice.peers}
              localSpeaking={voice.localSpeaking}
              muted={voice.muted}
              deafened={voice.deafened}
              currentUserId={user.id}
              currentUsername={user.displayName || user.username}
              currentAvatarUrl={user.avatarUrl}
              connectionState={voice.connectionState}
              voiceError={voice.error}
              onOpenDm={() => setDmPopoutOpen(true)}
              onRetryConnection={() => void voice.retryVoiceConnection()}
              onOpenMicSettings={() => {
                setVoiceSettingsFocus("microphone");
                setVoiceSettingsOpen(true);
              }}
              onOpenCameraSettings={() => {
                setVoiceSettingsFocus("microphone");
                setVoiceSettingsOpen(true);
              }}
              textChannel={
                activeTextChannel
                  ? {
                      channelId: activeTextChannel.id,
                      channelName: activeTextChannel.name,
                      channelTopic: activeTextChannel.topic,
                      slowModeSeconds: activeTextChannel.slowModeSeconds,
                    }
                  : null
              }
            />
          ) : !loading && activeTextChannel && user ? (
            <TextChannelPanel
              serverId={activeServer!.id}
              channelId={activeTextChannel.id}
              channelName={activeTextChannel.name}
              channelTopic={activeTextChannel.topic}
              slowModeSeconds={activeTextChannel.slowModeSeconds ?? 0}
              currentUserId={user.id}
              onOpenDm={(userId) => {
                setOpenDmUserId(userId);
                setShowFriends(true);
              }}
            />
          ) : !loading && !showFriends ? (
            <div className="app-welcome">
              <div className="app-welcome-icon" aria-hidden="true">
                <HashIcon />
              </div>
              <h2>Welcome to {activeServer?.name ?? "your server"}</h2>
              <p>
                Pick a text channel to start chatting, or join a voice channel from the list.
              </p>
            </div>
          ) : null}
        </section>
      </main>

      {showMembersPanel && (
        <MembersPanel
          serverId={activeServer?.id ?? null}
          serverName={activeServer?.name ?? null}
          currentUserId={user?.id ?? ""}
          collapsed={!showMembers}
          onToggleCollapsed={() => setShowMembers((v) => !v)}
          onOpenDm={(userId) => {
            setOpenDmUserId(userId);
            setShowFriends(true);
          }}
        />
      )}

      {rulesGate && (
        <RulesAcceptModal
          serverId={rulesGate.serverId}
          serverName={rulesGate.serverName}
          onAccepted={() => setRulesGate(null)}
        />
      )}

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

      <DmPopout
        open={dmPopoutOpen}
        onClose={() => setDmPopoutOpen(false)}
        onJoinVoiceInvite={(serverId, channelId) => void handleJoinVoiceInvite(serverId, channelId)}
        joiningVoiceInvite={joiningVoiceInvite}
      />

      {voiceSetupOpen && (
        <VoiceSetupModal onComplete={() => setVoiceSetupOpen(false)} />
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
