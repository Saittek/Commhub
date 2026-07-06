export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (!turnUrl?.trim()) {
    return servers;
  }

  const entry: RTCIceServer = { urls: turnUrl.trim() };
  const username = import.meta.env.VITE_TURN_USERNAME as string | undefined;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

  if (username?.trim()) {
    entry.username = username.trim();
  }
  if (credential?.trim()) {
    entry.credential = credential.trim();
  }

  servers.push(entry);
  return servers;
}
