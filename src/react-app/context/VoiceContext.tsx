import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Channel } from "../lib/api";
import {
  getVoiceVideoPreferences,
  type VoiceVideoPreferences,
} from "../lib/voice-video-settings";
import {
  VoiceClient,
  type LocalVoiceMedia,
  type RemoteVoiceMedia,
  type VoiceConnectionState,
  type VoicePeer,
} from "../lib/voice-client";
import {
  playVoiceConnectSound,
  playVoiceDisconnectSound,
  playVoiceErrorSound,
} from "../lib/voice-sounds";
import { useAuth } from "./AuthContext";

export interface JoinedVoiceChannel {
  serverId: string;
  serverName: string;
  channelId: string;
  channelName: string;
}

interface VoiceContextValue {
  joined: JoinedVoiceChannel | null;
  connectionState: VoiceConnectionState;
  error: string | null;
  peers: VoicePeer[];
  muted: boolean;
  deafened: boolean;
  localMedia: LocalVoiceMedia;
  remoteMedia: RemoteVoiceMedia[];
  localSpeaking: boolean;
  isJoined: boolean;
  join: (server: { id: string; name: string }, channel: Channel) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  setPushToTalk: (active: boolean) => void;
  clearError: () => void;
  updateVoiceVideoSettings: (prefs: VoiceVideoPreferences) => Promise<void>;
  retryVoiceConnection: () => Promise<void>;
}

const EMPTY_LOCAL_MEDIA: LocalVoiceMedia = {
  cameraStream: null,
  screenStream: null,
  cameraEnabled: false,
  screenSharing: false,
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const clientRef = useRef<VoiceClient | null>(null);
  const joinRef = useRef<(server: { id: string; name: string }, channel: Channel) => Promise<void>>(
    async () => {},
  );
  const channelPushToTalkRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const [joined, setJoined] = useState<JoinedVoiceChannel | null>(null);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [peers, setPeers] = useState<VoicePeer[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [localMedia, setLocalMedia] = useState<LocalVoiceMedia>(EMPTY_LOCAL_MEDIA);
  const [remoteMedia, setRemoteMedia] = useState<RemoteVoiceMedia[]>([]);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const prevConnectionStateRef = useRef<VoiceConnectionState>("disconnected");

  mutedRef.current = muted;
  deafenedRef.current = deafened;

  const applyAudioStateToClient = useCallback((client: VoiceClient) => {
    if (deafenedRef.current) {
      client.setDeafened(true);
      client.setMuted(true);
      return;
    }
    if (mutedRef.current) {
      client.setMuted(true);
    }
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setJoined(null);
    setPeers([]);
    setError(null);
    setConnectionState("disconnected");
    setLocalMedia(EMPTY_LOCAL_MEDIA);
    setRemoteMedia([]);
    setLocalSpeaking(false);
  }, []);

  useEffect(() => {
    if (!user) {
      disconnect();
      setMuted(false);
      setDeafened(false);
    }
  }, [user, disconnect]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const prev = prevConnectionStateRef.current;
    if (connectionState === "connected" && prev !== "connected") {
      playVoiceConnectSound();
    }
    if (connectionState === "disconnected" && (prev === "connected" || prev === "connecting")) {
      playVoiceDisconnectSound();
    }
    if (connectionState === "error" && prev !== "error") {
      playVoiceErrorSound();
    }
    prevConnectionStateRef.current = connectionState;
  }, [connectionState]);

  const join = useCallback(
    async (server: { id: string; name: string }, channel: Channel) => {
      if (!user || channel.type !== "voice") {
        return;
      }

      if (joined && joined.channelId !== channel.id) {
        disconnect();
      }

      if (clientRef.current && joined?.channelId === channel.id) {
        return;
      }

      if (joined?.channelId === channel.id && connectionState === "connected") {
        return;
      }

      setError(null);
      setJoined({
        serverId: server.id,
        serverName: server.name,
        channelId: channel.id,
        channelName: channel.name,
      });

      const client = new VoiceClient({
        serverId: server.id,
        channelId: channel.id,
        localUserId: user.id,
        onPeersChange: (nextPeers) => {
          if (clientRef.current !== client) {
            return;
          }
          setPeers(nextPeers);
        },
        onConnectionState: (state, message) => {
          if (clientRef.current !== client) {
            return;
          }
          setConnectionState(state);
          setError(state === "error" ? (message ?? "Voice connection failed.") : null);
          if (state === "disconnected" || state === "error") {
            setJoined(null);
            setPeers([]);
            setLocalMedia(EMPTY_LOCAL_MEDIA);
            setRemoteMedia([]);
            setLocalSpeaking(false);
            clientRef.current = null;
          }
        },
        onLocalMediaChange: (media) => {
          if (clientRef.current !== client) {
            return;
          }
          setLocalMedia(media);
        },
        onRemoteMediaChange: (media) => {
          if (clientRef.current !== client) {
            return;
          }
          setRemoteMedia(media);
        },
        onLocalSpeakingChange: (speaking) => {
          if (clientRef.current !== client) {
            return;
          }
          setLocalSpeaking(speaking);
        },
        onMoved: (targetChannelId, targetChannelName) => {
          void joinRef.current(server, {
            id: targetChannelId,
            serverId: server.id,
            name: targetChannelName,
            type: channel.type,
            createdAt: channel.createdAt,
            voiceBitrate: channel.voiceBitrate,
            voiceUserLimit: channel.voiceUserLimit,
            voicePttOnly: channel.voicePttOnly,
          });
        },
      });

      clientRef.current = client;
      channelPushToTalkRef.current = channel.voicePttOnly ?? false;
      const settings = getVoiceVideoPreferences();
      await client.connect({
        channelPushToTalk: channelPushToTalkRef.current,
        voiceBitrate: channel.voiceBitrate ?? 64000,
        settings,
      });
      applyAudioStateToClient(client);
    },
    [user, joined, connectionState, disconnect, applyAudioStateToClient],
  );

  joinRef.current = join;

  const toggleMute = useCallback(() => {
    const wasDeafened = deafenedRef.current;
    const next = !mutedRef.current;
    setMuted(next);
    if (next && wasDeafened) {
      setDeafened(false);
    }

    const client = clientRef.current;
    if (!client) {
      return;
    }

    client.setMuted(next);
    if (next && wasDeafened) {
      client.setDeafened(false);
    }
  }, []);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    setDeafened(next);
    setMuted(next);

    const client = clientRef.current;
    if (!client) {
      return;
    }

    client.setDeafened(next);
    client.setMuted(next);
  }, []);

  const setPushToTalk = useCallback((active: boolean) => {
    clientRef.current?.setPushToTalk(active);
  }, []);

  const toggleCamera = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const message = await client.toggleCamera();
    if (message) {
      setError(message);
    } else {
      setError(null);
      setLocalMedia(client.localMedia);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return;
    }

    const message = await client.toggleScreenShare();
    if (message) {
      setError(message);
    } else {
      setError(null);
      setLocalMedia(client.localMedia);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const updateVoiceVideoSettings = useCallback(async (prefs: VoiceVideoPreferences) => {
    if (clientRef.current) {
      await clientRef.current.updateVoiceVideoSettings(prefs);
      clientRef.current.setChannelPushToTalk(channelPushToTalkRef.current, prefs.pushToTalk);
    }
  }, []);

  const retryVoiceConnection = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.retryConnect();
    }
  }, []);

  const isJoined = joined !== null && connectionState === "connected";

  const value: VoiceContextValue = {
    joined,
    connectionState,
    error,
    peers,
    muted,
    deafened,
    localMedia,
    remoteMedia,
    localSpeaking,
    isJoined,
    join,
    disconnect,
    toggleMute,
    toggleDeafen,
    toggleCamera,
    toggleScreenShare,
    setPushToTalk,
    clearError,
    updateVoiceVideoSettings,
    retryVoiceConnection,
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoice must be used within a VoiceProvider.");
  }
  return context;
}
