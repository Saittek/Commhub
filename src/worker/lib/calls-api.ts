const CALLS_API_BASE = "https://rtc.live.cloudflare.com/v1";

export interface CallsSessionDescription {
  sdp: string;
  type: "offer" | "answer" | "pranswer" | "rollback";
}

export interface CallsTrackDescriptor {
  location: "local" | "remote";
  trackName: string;
  mid?: string;
  sessionId?: string;
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

function callsHeaders(secret: string): HeadersInit {
  return {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/json",
  };
}

function appBase(appId: string): string {
  return `${CALLS_API_BASE}/apps/${appId}`;
}

export function callsConfigured(env: Env): boolean {
  return Boolean(env.CALLS_APP_ID?.trim() && env.CALLS_APP_SECRET?.trim());
}

export async function createCallsSession(env: Env): Promise<{ sessionId: string }> {
  if (!callsConfigured(env)) {
    throw new Error("Cloudflare Calls is not configured.");
  }

  const response = await fetch(`${appBase(env.CALLS_APP_ID!)}/sessions/new`, {
    method: "POST",
    headers: callsHeaders(env.CALLS_APP_SECRET!),
  });

  const data = (await response.json()) as { sessionId?: string; errorDescription?: string };
  if (!response.ok || !data.sessionId) {
    throw new Error(data.errorDescription ?? "Could not create Calls session.");
  }

  return { sessionId: data.sessionId };
}

export async function addCallsTracks(
  env: Env,
  sessionId: string,
  payload: {
    sessionDescription?: CallsSessionDescription;
    tracks: CallsTrackDescriptor[];
  },
): Promise<CallsTracksResponse> {
  const response = await fetch(`${appBase(env.CALLS_APP_ID!)}/sessions/${sessionId}/tracks/new`, {
    method: "POST",
    headers: callsHeaders(env.CALLS_APP_SECRET!),
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as CallsTracksResponse;
  if (!response.ok || data.errorCode) {
    throw new Error(data.errorDescription ?? "Could not update Calls tracks.");
  }

  return data;
}

export async function renegotiateCallsSession(
  env: Env,
  sessionId: string,
  sessionDescription: CallsSessionDescription,
): Promise<void> {
  const response = await fetch(`${appBase(env.CALLS_APP_ID!)}/sessions/${sessionId}/renegotiate`, {
    method: "PUT",
    headers: callsHeaders(env.CALLS_APP_SECRET!),
    body: JSON.stringify({ sessionDescription }),
  });

  const data = (await response.json()) as CallsTracksResponse;
  if (!response.ok || data.errorCode) {
    throw new Error(data.errorDescription ?? "Could not renegotiate Calls session.");
  }
}

export async function closeCallsTracks(
  env: Env,
  sessionId: string,
  trackNames: string[],
): Promise<void> {
  if (trackNames.length === 0) {
    return;
  }

  const response = await fetch(`${appBase(env.CALLS_APP_ID!)}/sessions/${sessionId}/tracks/close`, {
    method: "PUT",
    headers: callsHeaders(env.CALLS_APP_SECRET!),
    body: JSON.stringify({
      tracks: trackNames.map((trackName) => ({ trackName })),
    }),
  });

  const data = (await response.json()) as CallsTracksResponse;
  if (!response.ok || data.errorCode) {
    throw new Error(data.errorDescription ?? "Could not close Calls tracks.");
  }
}
