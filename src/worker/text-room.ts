import { DurableObject } from "cloudflare:workers";

interface SubscriberAttachment {
  userId: string;
  displayName: string;
  username: string;
}

type TypingPayload = {
  type: "typing-start" | "typing-stop";
  userId: string;
  displayName: string;
  threadRootId?: string | null;
};

export class TextRoom extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const event = await request.json();
      this.broadcast(JSON.stringify(event));
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade.", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id");
    const displayName = request.headers.get("X-Display-Name");
    const username = request.headers.get("X-Username");

    if (!userId || !displayName || !username) {
      return new Response("Missing text session headers.", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const attachment: SubscriberAttachment = { userId, displayName, username };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    server.send(JSON.stringify({ type: "connected" }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as SubscriberAttachment | null;
    if (!attachment) {
      return;
    }

    let payload: TypingPayload;
    try {
      payload = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (payload.type === "typing-start" || payload.type === "typing-stop") {
      this.broadcast(
        JSON.stringify({
          type: payload.type,
          userId: attachment.userId,
          displayName: attachment.displayName,
          threadRootId: payload.threadRootId ?? null,
        }),
        ws,
      );
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SubscriberAttachment | null;
    if (!attachment) {
      return;
    }

    this.broadcast(
      JSON.stringify({
        type: "typing-stop",
        userId: attachment.userId,
        displayName: attachment.displayName,
      }),
      ws,
    );
  }

  private broadcast(message: string, except?: WebSocket) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket !== except) {
        socket.send(message);
      }
    }
  }
}
