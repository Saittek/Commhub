import { DurableObject } from "cloudflare:workers";

export interface VoicePeer {
  userId: string;
  displayName: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

interface PeerAttachment {
  userId: string;
  displayName: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  serverMuted: boolean;
  serverDeafened: boolean;
  speaking: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}

interface RTCIceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

interface SignalPayload {
  toUserId: string;
  data: RTCSignalData;
}

interface RTCSignalData {
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
}

interface StateUpdatePayload {
  muted?: boolean;
  deafened?: boolean;
  speaking?: boolean;
  cameraEnabled?: boolean;
  screenSharing?: boolean;
}

type InboundMessage =
  | { type: "signal"; toUserId: string; data: RTCSignalData }
  | {
      type: "update-state";
      muted?: boolean;
      deafened?: boolean;
      speaking?: boolean;
      cameraEnabled?: boolean;
      screenSharing?: boolean;
    };

export class VoiceRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/moderate" && request.method === "POST") {
      return this.handleModerate(request);
    }

    if (url.pathname === "/move" && request.method === "POST") {
      return this.handleMove(request);
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id");
    const displayName = request.headers.get("X-Display-Name");
    const username = request.headers.get("X-Username");
    const userLimitHeader = request.headers.get("X-Voice-User-Limit");

    if (!userId || !displayName || !username) {
      return new Response("Missing voice session headers.", { status: 400 });
    }

    const userLimit = Number(userLimitHeader ?? "0");
    const existingSockets = this.ctx.getWebSockets();
    const alreadyConnected = existingSockets.some((socket) => {
      const attachment = socket.deserializeAttachment() as PeerAttachment | null;
      return attachment?.userId === userId;
    });

    if (!alreadyConnected && userLimit > 0) {
      const uniqueUsers = new Set(
        existingSockets
          .map((socket) => (socket.deserializeAttachment() as PeerAttachment | null)?.userId)
          .filter(Boolean),
      );
      if (uniqueUsers.size >= userLimit) {
        return new Response("This voice channel is full.", { status: 403 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const attachment: PeerAttachment = {
      userId,
      displayName,
      username,
      muted: false,
      deafened: false,
      serverMuted: false,
      serverDeafened: false,
      speaking: false,
      cameraEnabled: false,
      screenSharing: false,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    const peers = this.getPeers().filter((peer) => peer.userId !== userId);
    server.send(JSON.stringify({ type: "welcome", peers }));

    if (!alreadyConnected) {
      this.broadcast(
        JSON.stringify({
          type: "peer-joined",
          peer: this.attachmentToPeer(attachment),
        }),
        server,
      );
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    if (!attachment) {
      return;
    }

    let payload: InboundMessage;
    try {
      payload = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (payload.type === "signal") {
      this.relaySignal(attachment.userId, payload);
      return;
    }

    if (payload.type === "update-state") {
      this.updatePeerState(ws, attachment, payload);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as PeerAttachment | null;
    if (!attachment) {
      return;
    }

    const stillConnected = this.ctx.getWebSockets().some((socket) => {
      if (socket === ws) {
        return false;
      }
      const peer = socket.deserializeAttachment() as PeerAttachment | null;
      return peer?.userId === attachment.userId;
    });

    if (!stillConnected) {
      this.broadcast(
        JSON.stringify({
          type: "peer-left",
          userId: attachment.userId,
        }),
        ws,
      );
    }
  }

  private relaySignal(fromUserId: string, payload: SignalPayload) {
    for (const socket of this.ctx.getWebSockets()) {
      const peer = socket.deserializeAttachment() as PeerAttachment | null;
      if (peer?.userId === payload.toUserId) {
        socket.send(
          JSON.stringify({
            type: "signal",
            fromUserId,
            data: payload.data,
          }),
        );
        return;
      }
    }
  }

  private updatePeerState(ws: WebSocket, attachment: PeerAttachment, payload: StateUpdatePayload) {
    if (payload.muted !== undefined) {
      attachment.muted = payload.muted;
    }
    if (payload.deafened !== undefined) {
      attachment.deafened = payload.deafened;
      if (attachment.deafened) {
        attachment.speaking = false;
      }
    }
    if (
      payload.speaking !== undefined &&
      !attachment.deafened &&
      !attachment.serverDeafened &&
      !attachment.serverMuted
    ) {
      attachment.speaking = payload.speaking;
    }
    if (payload.cameraEnabled !== undefined) {
      attachment.cameraEnabled = payload.cameraEnabled;
    }
    if (payload.screenSharing !== undefined) {
      attachment.screenSharing = payload.screenSharing;
    }

    ws.serializeAttachment(attachment);
    this.broadcast(
      JSON.stringify({
        type: "peer-state",
        userId: attachment.userId,
        muted: attachment.muted,
        deafened: attachment.deafened,
        serverMuted: attachment.serverMuted,
        serverDeafened: attachment.serverDeafened,
        speaking: attachment.speaking,
        cameraEnabled: attachment.cameraEnabled,
        screenSharing: attachment.screenSharing,
      }),
    );
  }

  private async handleModerate(request: Request): Promise<Response> {
    let payload: {
      targetUserId?: string;
      serverMuted?: boolean;
      serverDeafened?: boolean;
    };

    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }

    if (!payload.targetUserId) {
      return Response.json({ error: "targetUserId is required." }, { status: 400 });
    }

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as PeerAttachment | null;
      if (!attachment || attachment.userId !== payload.targetUserId) {
        continue;
      }

      if (payload.serverMuted !== undefined) {
        attachment.serverMuted = payload.serverMuted;
        if (attachment.serverMuted) {
          attachment.speaking = false;
        }
      }
      if (payload.serverDeafened !== undefined) {
        attachment.serverDeafened = payload.serverDeafened;
        attachment.speaking = false;
        if (attachment.serverDeafened) {
          attachment.deafened = true;
        }
      }

      socket.serializeAttachment(attachment);
      this.broadcast(
        JSON.stringify({
          type: "peer-state",
          userId: attachment.userId,
          muted: attachment.muted,
          deafened: attachment.deafened,
          serverMuted: attachment.serverMuted,
          serverDeafened: attachment.serverDeafened,
          speaking: attachment.speaking,
          cameraEnabled: attachment.cameraEnabled,
          screenSharing: attachment.screenSharing,
        }),
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: "User is not in this voice channel." }, { status: 404 });
  }

  private async handleMove(request: Request): Promise<Response> {
    let payload: {
      targetUserId?: string;
      targetChannelId?: string;
      targetChannelName?: string;
      serverId?: string;
      serverName?: string;
    };

    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }

    if (!payload.targetUserId || !payload.targetChannelId) {
      return Response.json({ error: "targetUserId and targetChannelId are required." }, { status: 400 });
    }

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as PeerAttachment | null;
      if (!attachment || attachment.userId !== payload.targetUserId) {
        continue;
      }

      socket.send(
        JSON.stringify({
          type: "moved",
          channelId: payload.targetChannelId,
          channelName: payload.targetChannelName ?? "Voice",
          serverId: payload.serverId ?? "",
          serverName: payload.serverName ?? "",
        }),
      );
      socket.close(4000, "Moved to another channel");
      this.broadcast(
        JSON.stringify({
          type: "peer-left",
          userId: attachment.userId,
        }),
        socket,
      );
      return Response.json({ ok: true });
    }

    return Response.json({ error: "User is not in this voice channel." }, { status: 404 });
  }

  private getPeers(): VoicePeer[] {
    const peers: VoicePeer[] = [];
    const seen = new Set<string>();

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as PeerAttachment | null;
      if (!attachment || seen.has(attachment.userId)) {
        continue;
      }
      seen.add(attachment.userId);
      peers.push(this.attachmentToPeer(attachment));
    }

    return peers;
  }

  private attachmentToPeer(attachment: PeerAttachment): VoicePeer {
    return {
      userId: attachment.userId,
      displayName: attachment.displayName,
      serverMuted: attachment.serverMuted,
      serverDeafened: attachment.serverDeafened,
      username: attachment.username,
      muted: attachment.muted,
      deafened: attachment.deafened,
      speaking: attachment.speaking,
      cameraEnabled: attachment.cameraEnabled,
      screenSharing: attachment.screenSharing,
    };
  }

  private broadcast(message: string, except?: WebSocket) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) {
        socket.send(message);
      }
    }
  }
}
