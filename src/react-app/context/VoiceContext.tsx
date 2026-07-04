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

  const join = useCallback(
    async (server: { id: string; name: string }, channel: Channel) => {
      if (!user || channel.type !== "voice") {
        return;
      }

      if (joined && joined.channelId !== channel.id) {
        setError(
          `You are connected to ${joined.channelName}. Disconnect before joining another voice channel.`,
        );
        return;
      }

      if (joined?.channelId === channel.id && connectionState !== "disconnected") {
        return;
      }

      if (clientRef.current) {
        disconnect();
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
        onPeersChange: setPeers,
        onConnectionState: (state, message) => {
          setConnectionState(state);
          setError(state === "error" ? (message ?? "Voice connection failed.") : null);
          if (state === "disconnected" || state === "error") {
            setJoined(null);
            setPeers([]);
            setLocalMedia(EMPTY_LOCAL_MEDIA);
            setRemoteMedia([]);
            clientRef.current = null;
          }
        },
        onLocalMediaChange: setLocalMedia,
        onRemoteMediaChange: setRemoteMedia,
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
