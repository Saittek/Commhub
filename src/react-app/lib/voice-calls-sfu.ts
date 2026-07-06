export interface CallsConfig {
  enabled: boolean;
  iceServers: RTCIceServer[];
}

export interface CallsSessionDescription {
  sdp: string;
  type: RTCSdpType;
}

export interface CallsTrackResult {
  trackName: string;
  mid?: string;
}

export interface CallsTracksResponse {
  sessionDescription?: CallsSessionDescription;
  tracks?: CallsTrackResult[];
  requiresImmediateRenegotiation?: boolean;
  errorCode?: string;
  errorDescription?: string;
}

export type CallsTrackKind = "audio" | "camera" | "screen";

export function trackNameFor(kind: CallsTrackKind, userId: string): string {
  return `${kind}-${userId}`;
}

export function parseTrackName(
  trackName: string,
): { kind: CallsTrackKind; userId: string } | null {
  const match = /^(audio|camera|screen)-(.+)$/.exec(trackName);
  if (!match) {
    return null;
  }
  return { kind: match[1] as CallsTrackKind, userId: match[2] };
}

export async function fetchCallsConfig(
  serverId: string,
  channelId: string,
): Promise<CallsConfig> {
  const response = await fetch(
    `/api/servers/${serverId}/channels/${channelId}/voice/calls/config`,
  );
  if (!response.ok) {
    return { enabled: false, iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
  }
  return (await response.json()) as CallsConfig;
}

export class VoiceCallsSfu {
  private readonly serverId: string;
  private readonly channelId: string;
  private pc: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private readonly published = new Map<
    string,
    { transceiver: RTCRtpTransceiver; mid?: string }
  >();
  private readonly pulled = new Map<string, MediaStreamTrack>();

  constructor(serverId: string, channelId: string) {
    this.serverId = serverId;
    this.channelId = channelId;
  }

  get activeSessionId(): string | null {
    return this.sessionId;
  }

  getPublishedTrackNames(): string[] {
    return Array.from(this.published.keys());
  }

  async start(iceServers: RTCIceServer[]): Promise<string> {
    const response = await this.apiFetch("/session", { method: "POST" });
    const data = (await response.json()) as { sessionId?: string; error?: string };
    if (!response.ok || !data.sessionId) {
      throw new Error(data.error ?? "Could not create Calls session.");
    }

    this.sessionId = data.sessionId;
    this.pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
    });
    return data.sessionId;
  }

  async publishTrack(trackName: string, track: MediaStreamTrack): Promise<void> {
    await this.publishTracks([{ trackName, track }]);
  }

  async publishTracks(
    tracks: Array<{ trackName: string; track: MediaStreamTrack }>,
  ): Promise<void> {
    if (tracks.length === 0) {
      return;
    }

    const pc = this.requirePeerConnection();
    const pending: Array<{ trackName: string; track: MediaStreamTrack; transceiver: RTCRtpTransceiver }> =
      [];

    for (const { trackName, track } of tracks) {
      const existing = this.published.get(trackName);
      if (existing) {
        await existing.transceiver.sender.replaceTrack(track);
        continue;
      }

      const transceiver = pc.addTransceiver(track, { direction: "sendonly" });
      this.published.set(trackName, { transceiver });
      pending.push({ trackName, track, transceiver });
    }

    if (pending.length === 0) {
      return;
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const pushResponse = await this.postTracks({
      sessionDescription: {
        sdp: offer.sdp ?? "",
        type: offer.type,
      },
      tracks: pending.map(({ trackName, transceiver }) => ({
        location: "local" as const,
        mid: transceiver.mid,
        trackName,
      })),
    });

    for (let index = 0; index < pending.length; index += 1) {
      const entry = this.published.get(pending[index].trackName);
      const mid = pushResponse.tracks?.[index]?.mid;
      if (entry && mid) {
        entry.mid = mid;
      }
    }

    if (pushResponse.sessionDescription) {
      await pc.setRemoteDescription(pushResponse.sessionDescription);
    }
  }

  async unpublishTrack(trackName: string): Promise<void> {
    const entry = this.published.get(trackName);
    if (!entry || !this.sessionId) {
      return;
    }

    await this.apiFetch("/tracks/close", {
      method: "PUT",
      body: JSON.stringify({
        sessionId: this.sessionId,
        trackNames: [trackName],
      }),
    });

    await entry.transceiver.sender.replaceTrack(null);
    this.published.delete(trackName);
  }

  async pullTracks(
    refs: Array<{ trackName: string; sessionId: string }>,
  ): Promise<MediaStreamTrack[]> {
    const pending = refs.filter((ref) => {
      const key = this.pullKey(ref.sessionId, ref.trackName);
      return !this.pulled.has(key);
    });

    if (pending.length === 0) {
      return refs
        .map((ref) => this.pulled.get(this.pullKey(ref.sessionId, ref.trackName)))
        .filter((track): track is MediaStreamTrack => Boolean(track));
    }

    const pc = this.requirePeerConnection();
    const pullResponse = await this.postTracks({
      tracks: pending.map((ref) => ({
        location: "remote" as const,
        trackName: ref.trackName,
        sessionId: ref.sessionId,
      })),
    });

    const resolvingTracks = Promise.all(
      (pullResponse.tracks ?? []).map(
        ({ mid, trackName }) =>
          new Promise<MediaStreamTrack>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Timed out pulling track ${trackName}.`));
            }, 10_000);

            const handleTrack = (event: RTCTrackEvent) => {
              if (event.transceiver.mid !== mid) {
                return;
              }
              pc.removeEventListener("track", handleTrack);
              clearTimeout(timeout);
              resolve(event.track);
            };

            pc.addEventListener("track", handleTrack);
          }),
      ),
    );

    if (pullResponse.sessionDescription) {
      await pc.setRemoteDescription(pullResponse.sessionDescription);
    }

    if (pullResponse.requiresImmediateRenegotiation) {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.renegotiate({
        sdp: answer.sdp ?? "",
        type: answer.type,
      });
    }

    const tracks = await resolvingTracks;
    for (let index = 0; index < pending.length; index += 1) {
      const ref = pending[index];
      const track = tracks[index];
      if (track) {
        this.pulled.set(this.pullKey(ref.sessionId, ref.trackName), track);
      }
    }

    return refs
      .map((ref) => this.pulled.get(this.pullKey(ref.sessionId, ref.trackName)))
      .filter((track): track is MediaStreamTrack => Boolean(track));
  }

  async replacePublishedAudio(track: MediaStreamTrack): Promise<void> {
    for (const [trackName, entry] of this.published) {
      if (!trackName.startsWith("audio-")) {
        continue;
      }
      await entry.transceiver.sender.replaceTrack(track);
      return;
    }
  }

  destroy(): void {
    this.pc?.close();
    this.pc = null;
    this.sessionId = null;
    this.published.clear();
    this.pulled.clear();
  }

  private pullKey(sessionId: string, trackName: string): string {
    return `${sessionId}:${trackName}`;
  }

  private requirePeerConnection(): RTCPeerConnection {
    if (!this.pc || !this.sessionId) {
      throw new Error("Calls SFU session is not started.");
    }
    return this.pc;
  }

  private callsBase(): string {
    return `/api/servers/${this.serverId}/channels/${this.channelId}/voice/calls`;
  }

  private async apiFetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.callsBase()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  private async postTracks(body: Record<string, unknown>): Promise<CallsTracksResponse> {
    const response = await this.apiFetch("/tracks", {
      method: "POST",
      body: JSON.stringify({
        sessionId: this.sessionId,
        ...body,
      }),
    });

    const data = (await response.json()) as CallsTracksResponse & { error?: string };
    if (!response.ok || data.errorCode) {
      throw new Error(data.errorDescription ?? data.error ?? "Calls track update failed.");
    }

    return data;
  }

  private async renegotiate(sessionDescription: CallsSessionDescription): Promise<void> {
    const response = await this.apiFetch("/renegotiate", {
      method: "PUT",
      body: JSON.stringify({
        sessionId: this.sessionId,
        sessionDescription,
      }),
    });

    const data = (await response.json()) as CallsTracksResponse & { error?: string };
    if (!response.ok || data.errorCode) {
      throw new Error(data.errorDescription ?? data.error ?? "Calls renegotiation failed.");
    }
  }
}
