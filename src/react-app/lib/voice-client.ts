import {
  applyOutputDevice,
  buildAudioConstraints,
  buildVideoConstraints,
  effectiveProcessing,
  effectiveSensitivity,
  speakingThreshold,
  type VoiceVideoPreferences,
} from "./voice-video-settings";
import { requestScreenCaptureStream, ScreenCaptureError } from "./screen-capture";

export interface VoicePeer {
  userId: string;
  displayName: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

export interface LocalVoiceMedia {
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

export interface RemoteVoiceMedia {
  userId: string;
  displayName: string;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
}

export type VoiceConnectionState = "disconnected" | "connecting" | "connected" | "error";

interface VoiceClientOptions {
  serverId: string;
  channelId: string;
  localUserId: string;
  onPeersChange: (peers: VoicePeer[]) => void;
  onConnectionState: (state: VoiceConnectionState, error?: string) => void;
  onLocalMediaChange: (media: LocalVoiceMedia) => void;
  onRemoteMediaChange: (media: RemoteVoiceMedia[]) => void;
}

interface RTCSignalData {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

function isScreenShareTrack(track: MediaStreamTrack): boolean {
  const settings = track.getSettings();
  return Boolean(settings.displaySurface);
}

function defaultPeer(peer: Partial<VoicePeer> & Pick<VoicePeer, "userId" | "displayName" | "username">): VoicePeer {
  return {
    userId: peer.userId,
    displayName: peer.displayName,
    username: peer.username,
    muted: peer.muted ?? false,
    deafened: peer.deafened ?? false,
    speaking: peer.speaking ?? false,
    cameraEnabled: peer.cameraEnabled ?? false,
    screenSharing: peer.screenSharing ?? false,
  };
}

export class VoiceClient {
  private readonly serverId: string;
  private readonly channelId: string;
  private readonly localUserId: string;
  private readonly onPeersChange: (peers: VoicePeer[]) => void;
  private readonly onConnectionState: (state: VoiceConnectionState, error?: string) => void;
  private readonly onLocalMediaChange: (media: LocalVoiceMedia) => void;
  private readonly onRemoteMediaChange: (media: RemoteVoiceMedia[]) => void;

  private ws: WebSocket | null = null;
  private localStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private cameraEnabled = false;
  private screenSharing = false;
  private peers = new Map<string, VoicePeer>();
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteAudio = new Map<string, HTMLAudioElement>();
  private remoteMedia = new Map<string, { camera: MediaStream | null; screen: MediaStream | null }>();
  private muted = false;
  private deafened = false;
  private pttOnly = false;
  private channelPushToTalk = false;
  private pttActive = false;
  private voiceBitrate = 64000;
  private inputDeviceId = "";
  private outputDeviceId = "";
  private cameraDeviceId = "";
  private processing = effectiveProcessing({
    inputDeviceId: "",
    outputDeviceId: "",
    cameraDeviceId: "",
    inputProfile: "balanced",
    processing: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
    pushToTalk: false,
    voiceActivitySensitivity: 55,
  });
  private speakingSensitivity = 55;
  private speaking = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private speakingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: VoiceClientOptions) {
    this.serverId = options.serverId;
    this.channelId = options.channelId;
    this.localUserId = options.localUserId;
    this.onPeersChange = options.onPeersChange;
    this.onConnectionState = options.onConnectionState;
    this.onLocalMediaChange = options.onLocalMediaChange;
    this.onRemoteMediaChange = options.onRemoteMediaChange;
  }

  get localMedia(): LocalVoiceMedia {
    return {
      cameraStream: this.cameraStream,
      screenStream: this.screenStream,
      cameraEnabled: this.cameraEnabled,
      screenSharing: this.screenSharing,
    };
  }

  get isMuted() {
    return this.muted;
  }

  get isDeafened() {
    return this.deafened;
  }

  async connect(options: {
    channelPushToTalk: boolean;
    voiceBitrate?: number;
    settings: VoiceVideoPreferences;
  }): Promise<void> {
    const { settings } = options;
    this.pttOnly = options.channelPushToTalk || settings.pushToTalk;
    this.channelPushToTalk = options.channelPushToTalk;
    this.voiceBitrate = options.voiceBitrate ?? 64000;
    this.inputDeviceId = settings.inputDeviceId;
    this.outputDeviceId = settings.outputDeviceId;
    this.cameraDeviceId = settings.cameraDeviceId;
    this.processing = effectiveProcessing(settings);
    this.speakingSensitivity = effectiveSensitivity(settings);
    this.onConnectionState("connecting");

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(this.inputDeviceId, this.processing),
        video: false,
      });
      this.applyMicTrackState();
      this.setupSpeakingDetection();
      this.emitLocalMedia();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/servers/${this.serverId}/channels/${this.channelId}/voice`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.onConnectionState("connected");
      };

      this.ws.onmessage = (event) => {
        this.handleSocketMessage(String(event.data));
      };

      this.ws.onclose = () => {
        this.cleanup(false);
        this.onConnectionState("disconnected");
      };

      this.ws.onerror = () => {
        this.onConnectionState("error", "Voice connection failed.");
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Microphone access was denied or unavailable.";
      this.cleanup(false);
      this.onConnectionState("error", message);
    }
  }

  disconnect(): void {
    this.sendStateUpdate({
      muted: false,
      deafened: false,
      speaking: false,
      cameraEnabled: false,
      screenSharing: false,
    });
    this.ws?.close();
    this.cleanup(true);
    this.onConnectionState("disconnected");
  }

  async toggleCamera(): Promise<string | null> {
    if (this.cameraEnabled) {
      await this.stopCamera();
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: buildVideoConstraints(this.cameraDeviceId),
        audio: false,
      });
      this.cameraStream = stream;
      this.cameraEnabled = true;
      await this.publishStreamTracks(stream);
      this.sendStateUpdate({ cameraEnabled: true });
      this.emitLocalMedia();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Camera access was denied or unavailable.";
    }
  }

  async toggleScreenShare(): Promise<string | null> {
    if (this.screenSharing) {
      await this.stopScreenShare();
      return null;
    }

    try {
      const stream = await requestScreenCaptureStream();
      const track = stream.getVideoTracks()[0];
      if (!track) {
        for (const item of stream.getTracks()) {
          item.stop();
        }
        return "No screen video track was returned.";
      }

      track.addEventListener("ended", () => {
        void this.stopScreenShare();
      });

      this.screenStream = stream;
      this.screenSharing = true;
      await this.publishStreamTracks(stream);
      this.sendStateUpdate({ screenSharing: true });
      this.emitLocalMedia();
      return null;
    } catch (err) {
      if (err instanceof ScreenCaptureError && err.code === "denied") {
        return null;
      }
      if (err instanceof ScreenCaptureError) {
        return err.message;
      }
      return err instanceof Error ? err.message : "Screen sharing was denied or unavailable.";
    }
  }

  async stopCamera(): Promise<void> {
    if (!this.cameraStream) {
      this.cameraEnabled = false;
      this.emitLocalMedia();
      return;
    }

    await this.unpublishStreamTracks(this.cameraStream);
    for (const track of this.cameraStream.getTracks()) {
      track.stop();
    }
    this.cameraStream = null;
    this.cameraEnabled = false;
    this.sendStateUpdate({ cameraEnabled: false });
    this.emitLocalMedia();
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenStream) {
      this.screenSharing = false;
      this.emitLocalMedia();
      return;
    }

    await this.unpublishStreamTracks(this.screenStream);
    for (const track of this.screenStream.getTracks()) {
      track.stop();
    }
    this.screenStream = null;
    this.screenSharing = false;
    this.sendStateUpdate({ screenSharing: false });
    this.emitLocalMedia();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.speaking = false;
      this.sendStateUpdate({ muted: true, speaking: false });
    } else {
      this.sendStateUpdate({ muted: false });
    }
    this.applyMicTrackState();
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (deafened) {
      this.speaking = false;
      this.sendStateUpdate({ deafened: true, speaking: false });
    } else {
      this.sendStateUpdate({ deafened: false });
    }
    this.applyRemoteAudioState();
  }

  setPushToTalk(active: boolean): void {
    this.pttActive = active;
    this.applyMicTrackState();
  }

  async updateVoiceVideoSettings(settings: VoiceVideoPreferences): Promise<void> {
    this.inputDeviceId = settings.inputDeviceId;
    this.outputDeviceId = settings.outputDeviceId;
    this.cameraDeviceId = settings.cameraDeviceId;
    this.processing = effectiveProcessing(settings);
    this.speakingSensitivity = effectiveSensitivity(settings);
    this.pttOnly = this.channelPushToTalk || settings.pushToTalk;

    for (const audio of this.remoteAudio.values()) {
      await applyOutputDevice(audio, this.outputDeviceId);
    }

    if (!this.localStream) {
      return;
    }

    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: buildAudioConstraints(this.inputDeviceId, this.processing),
      video: false,
    });
    const newTrack = newStream.getAudioTracks()[0];

    for (const track of this.localStream.getAudioTracks()) {
      track.stop();
    }

    for (const pc of this.peerConnections.values()) {
      const sender = pc.getSenders().find((item) => item.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }

    this.localStream = newStream;
    this.teardownSpeakingDetection();
    this.applyMicTrackState();
    this.setupSpeakingDetection();
  }

  setChannelPushToTalk(channelPushToTalk: boolean, userPushToTalk: boolean): void {
    this.channelPushToTalk = channelPushToTalk;
    this.pttOnly = channelPushToTalk || userPushToTalk;
    this.applyMicTrackState();
  }

  private handleSocketMessage(raw: string) {
    let message: {
      type: string;
      peers?: VoicePeer[];
      peer?: VoicePeer;
      userId?: string;
      fromUserId?: string;
      data?: RTCSignalData;
      muted?: boolean;
      deafened?: boolean;
      speaking?: boolean;
      cameraEnabled?: boolean;
      screenSharing?: boolean;
    };

    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }

    switch (message.type) {
      case "welcome":
        if (message.peers) {
          for (const peer of message.peers) {
            this.peers.set(peer.userId, defaultPeer(peer));
            if (this.shouldInitiateConnection(peer.userId)) {
              void this.createOfferForPeer(peer.userId);
            }
          }
          this.emitPeers();
        }
        break;
      case "peer-joined":
        if (message.peer) {
          this.peers.set(message.peer.userId, defaultPeer(message.peer));
          this.emitPeers();
          if (this.shouldInitiateConnection(message.peer.userId)) {
            void this.createOfferForPeer(message.peer.userId);
          }
        }
        break;
      case "peer-left":
        if (message.userId) {
          this.removePeer(message.userId);
        }
        break;
      case "peer-state":
        if (message.userId) {
          const peer = this.peers.get(message.userId);
          if (peer) {
            peer.muted = message.muted ?? peer.muted;
            peer.deafened = message.deafened ?? peer.deafened;
            peer.speaking = message.speaking ?? peer.speaking;
            peer.cameraEnabled = message.cameraEnabled ?? peer.cameraEnabled;
            peer.screenSharing = message.screenSharing ?? peer.screenSharing;
            this.emitPeers();
          }
        }
        break;
      case "signal":
        if (message.fromUserId && message.data) {
          void this.handleSignal(message.fromUserId, message.data);
        }
        break;
      default:
        break;
    }
  }

  private shouldInitiateConnection(peerUserId: string): boolean {
    return this.localUserId < peerUserId;
  }

  private getOrCreatePeerConnection(peerUserId: string): RTCPeerConnection {
    const existing = this.peerConnections.get(peerUserId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    for (const { track, stream } of this.getPublishedTracks()) {
      pc.addTrack(track, stream);
    }

    this.preferOpusCodec(pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerUserId, {
          type: "ice",
          candidate: event.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (event) => {
      const track = event.track;
      if (track.kind === "audio") {
        let audio = this.remoteAudio.get(peerUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          this.remoteAudio.set(peerUserId, audio);
        }
        const audioStream = new MediaStream([track]);
        audio.srcObject = audioStream;
        void applyOutputDevice(audio, this.outputDeviceId);
        this.applyRemoteAudioState();
        return;
      }

      if (track.kind === "video") {
        this.attachRemoteVideoTrack(peerUserId, track);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        void this.applyOpusBitrate(pc);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.removePeer(peerUserId);
      }
    };

    this.peerConnections.set(peerUserId, pc);
    return pc;
  }

  private async createOfferForPeer(peerUserId: string) {
    const pc = this.getOrCreatePeerConnection(peerUserId);
    let offer = await pc.createOffer();
    if (offer.sdp) {
      offer = { type: offer.type, sdp: this.mungeOpusSdp(offer.sdp) };
    }
    await pc.setLocalDescription(offer);
    this.sendSignal(peerUserId, { type: "offer", sdp: offer.sdp ?? undefined });
  }

  private async handleSignal(fromUserId: string, data: RTCSignalData) {
    const pc = this.getOrCreatePeerConnection(fromUserId);

    if (data.type === "offer" && data.sdp) {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      let answer = await pc.createAnswer();
      if (answer.sdp) {
        answer = { type: answer.type, sdp: this.mungeOpusSdp(answer.sdp) };
      }
      await pc.setLocalDescription(answer);
      this.sendSignal(fromUserId, { type: "answer", sdp: answer.sdp ?? undefined });
      return;
    }

    if (data.type === "answer" && data.sdp) {
      await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
      return;
    }

    if (data.type === "ice" && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        // Ignore stale ICE candidates.
      }
    }
  }

  private sendSignal(toUserId: string, data: RTCSignalData) {
    this.ws?.send(JSON.stringify({ type: "signal", toUserId, data }));
  }

  private sendStateUpdate(state: {
    muted?: boolean;
    deafened?: boolean;
    speaking?: boolean;
    cameraEnabled?: boolean;
    screenSharing?: boolean;
  }) {
    this.ws?.send(JSON.stringify({ type: "update-state", ...state }));
  }

  private getPublishedTracks(): Array<{ track: MediaStreamTrack; stream: MediaStream }> {
    const published: Array<{ track: MediaStreamTrack; stream: MediaStream }> = [];

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        published.push({ track, stream: this.localStream });
      }
    }

    if (this.cameraStream) {
      for (const track of this.cameraStream.getVideoTracks()) {
        published.push({ track, stream: this.cameraStream });
      }
    }

    if (this.screenStream) {
      for (const track of this.screenStream.getVideoTracks()) {
        published.push({ track, stream: this.screenStream });
      }
    }

    return published;
  }

  private async publishStreamTracks(stream: MediaStream): Promise<void> {
    for (const track of stream.getTracks()) {
      for (const pc of this.peerConnections.values()) {
        const alreadyPublished = pc
          .getSenders()
          .some((sender) => sender.track?.id === track.id);
        if (!alreadyPublished) {
          pc.addTrack(track, stream);
        }
      }
    }

    await this.renegotiateAll();
  }

  private async unpublishStreamTracks(stream: MediaStream): Promise<void> {
    for (const track of stream.getTracks()) {
      for (const pc of this.peerConnections.values()) {
        const sender = pc.getSenders().find((item) => item.track?.id === track.id);
        if (sender) {
          pc.removeTrack(sender);
        }
      }
    }

    await this.renegotiateAll();
  }

  private async renegotiateAll(): Promise<void> {
    for (const [peerUserId, pc] of this.peerConnections) {
      try {
        let offer = await pc.createOffer();
        if (offer.sdp) {
          offer = { type: offer.type, sdp: this.mungeOpusSdp(offer.sdp) };
        }
        await pc.setLocalDescription(offer);
        this.sendSignal(peerUserId, { type: "offer", sdp: offer.sdp ?? undefined });
      } catch {
        // Ignore renegotiation failures for disconnected peers.
      }
    }
  }

  private attachRemoteVideoTrack(peerUserId: string, track: MediaStreamTrack) {
    let entry = this.remoteMedia.get(peerUserId);
    if (!entry) {
      entry = { camera: null, screen: null };
      this.remoteMedia.set(peerUserId, entry);
    }

    const stream = new MediaStream([track]);
    if (isScreenShareTrack(track)) {
      entry.screen = stream;
    } else {
      entry.camera = stream;
    }

    track.addEventListener("ended", () => {
      const media = this.remoteMedia.get(peerUserId);
      if (!media) {
        return;
      }

      if (isScreenShareTrack(track)) {
        media.screen = null;
      } else {
        media.camera = null;
      }
      this.emitRemoteMedia();
    });

    this.emitRemoteMedia();
  }

  private emitLocalMedia() {
    this.onLocalMediaChange(this.localMedia);
  }

  private emitRemoteMedia() {
    const media: RemoteVoiceMedia[] = [];

    for (const [userId, streams] of this.remoteMedia) {
      if (!streams.camera && !streams.screen) {
        continue;
      }

      const peer = this.peers.get(userId);
      media.push({
        userId,
        displayName: peer?.displayName ?? "Member",
        cameraStream: streams.camera,
        screenStream: streams.screen,
      });
    }

    this.onRemoteMediaChange(media);
  }

  private removePeer(userId: string) {
    this.peers.delete(userId);
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }
    const audio = this.remoteAudio.get(userId);
    if (audio) {
      audio.srcObject = null;
      this.remoteAudio.delete(userId);
    }
    this.remoteMedia.delete(userId);
    this.emitPeers();
    this.emitRemoteMedia();
  }

  private emitPeers() {
    this.onPeersChange(Array.from(this.peers.values()));
  }

  private preferOpusCodec(pc: RTCPeerConnection): void {
    if (typeof RTCRtpReceiver.getCapabilities !== "function") {
      return;
    }

    const capabilities = RTCRtpReceiver.getCapabilities("audio");
    if (!capabilities) {
      return;
    }

    const opusCodecs = capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() === "audio/opus",
    );
    if (opusCodecs.length === 0) {
      return;
    }

    const otherCodecs = capabilities.codecs.filter(
      (codec) => codec.mimeType.toLowerCase() !== "audio/opus",
    );

    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.sender.track?.kind === "audio") {
        transceiver.setCodecPreferences([...opusCodecs, ...otherCodecs]);
      }
    }
  }

  private mungeOpusSdp(sdp: string): string {
    const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000/);
    if (!opusMatch) {
      return sdp;
    }

    const payloadType = opusMatch[1];
    const fmtpPrefix = `a=fmtp:${payloadType}`;
    const opusParams = `minptime=10;useinbandfec=1;maxaveragebitrate=${this.voiceBitrate};stereo=0`;

    if (sdp.includes(fmtpPrefix)) {
      return sdp.replace(
        new RegExp(`${fmtpPrefix} [^\\r\\n]+`),
        `${fmtpPrefix} ${opusParams}`,
      );
    }

    const rtpmapLine = `a=rtpmap:${payloadType} opus/48000`;
    return sdp.replace(
      rtpmapLine,
      `${rtpmapLine}/2\r\n${fmtpPrefix} ${opusParams}`,
    );
  }

  private async applyOpusBitrate(pc: RTCPeerConnection): Promise<void> {
    const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
    if (!sender) {
      return;
    }

    try {
      const params = sender.getParameters();
      if (params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = this.voiceBitrate;
      await sender.setParameters(params);
    } catch {
      // Bitrate may already be set via SDP; ignore if the browser rejects this.
    }
  }

  private applyMicTrackState() {
    if (!this.localStream) {
      return;
    }

    const enabled = !this.muted && (!this.pttOnly || this.pttActive);
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = enabled;
    }
  }

  private applyRemoteAudioState() {
    for (const audio of this.remoteAudio.values()) {
      audio.muted = this.deafened;
    }
  }

  private teardownSpeakingDetection() {
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
  }

  private setupSpeakingDetection() {
    if (!this.localStream) {
      return;
    }

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.localStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);

    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.speakingInterval = setInterval(() => {
      if (!this.analyser || this.muted || this.deafened) {
        if (this.speaking) {
          this.speaking = false;
          this.sendStateUpdate({ speaking: false });
        }
        return;
      }

      this.analyser.getByteFrequencyData(buffer);
      const average = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
      const nextSpeaking =
        average > speakingThreshold(this.speakingSensitivity) &&
        (!this.pttOnly || this.pttActive);

      if (nextSpeaking !== this.speaking) {
        this.speaking = nextSpeaking;
        this.sendStateUpdate({ speaking: nextSpeaking });
      }
    }, 120);
  }

  private cleanup(closeSocket: boolean) {
    if (closeSocket) {
      this.ws?.close();
    }
    this.ws = null;

    this.teardownSpeakingDetection();

    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();

    for (const audio of this.remoteAudio.values()) {
      audio.srcObject = null;
    }
    this.remoteAudio.clear();

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    if (this.cameraStream) {
      for (const track of this.cameraStream.getTracks()) {
        track.stop();
      }
      this.cameraStream = null;
    }

    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;
    }

    this.remoteMedia.clear();
    this.cameraEnabled = false;
    this.screenSharing = false;
    this.emitLocalMedia();
    this.emitRemoteMedia();
    this.peers.clear();
    this.emitPeers();
    this.muted = false;
    this.deafened = false;
    this.pttActive = false;
    this.speaking = false;
  }
}
