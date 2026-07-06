export interface ParsedVoiceInvite {
  serverId: string;
  channelId: string;
  inviteId: string;
}

const VOICE_INVITE_RE = /<!--voice-invite:([^:]+):([^:]+):([^>]+)-->/;

export function parseVoiceInvite(content: string): ParsedVoiceInvite | null {
  const match = content.match(VOICE_INVITE_RE);
  if (!match) {
    return null;
  }

  return {
    serverId: match[1],
    channelId: match[2],
    inviteId: match[3],
  };
}

export function stripVoiceInviteMarker(content: string): string {
  return content.replace(/<!--voice-invite:[^>]+-->/g, "").trim();
}

export function isVoiceInviteMessage(content: string): boolean {
  return VOICE_INVITE_RE.test(content);
}
