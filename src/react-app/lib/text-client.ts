export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
}

export interface MessageAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
  userIds: string[];
}

export interface Message {
  id: string;
  channelId: string;
  serverId: string;
  author: MessageAuthor;
  content: string;
  threadRootId: string | null;
  replyToId: string | null;
  replyTo: {
    id: string;
    content: string;
    authorName: string;
  } | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  pinned: boolean;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
}

export type TextSocketEvent =
  | { type: "connected" }
  | { type: "message-create"; message: Message }
  | { type: "message-update"; message: Message }
  | { type: "typing-start"; userId: string; displayName: string; threadRootId?: string | null }
  | { type: "typing-stop"; userId: string; displayName: string; threadRootId?: string | null };

export class TextChannelClient {
  private readonly serverId: string;
  private readonly channelId: string;
  private readonly onEvent: (event: TextSocketEvent) => void;
  private readonly onConnectionState: (connected: boolean) => void;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(options: {
    serverId: string;
    channelId: string;
    onEvent: (event: TextSocketEvent) => void;
    onConnectionState: (connected: boolean) => void;
  }) {
    this.serverId = options.serverId;
    this.channelId = options.channelId;
    this.onEvent = options.onEvent;
    this.onConnectionState = options.onConnectionState;
  }

  connect() {
    this.closed = false;
    this.openSocket();
  }

  disconnect() {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.onConnectionState(false);
  }

  sendTyping(active: boolean, threadRootId?: string | null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: active ? "typing-start" : "typing-stop",
        threadRootId: threadRootId ?? null,
      }),
    );
  }

  private openSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/servers/${this.serverId}/channels/${this.channelId}/text`;

    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.onConnectionState(true);
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as TextSocketEvent;
        this.onEvent(payload);
      } catch {
        // Ignore malformed events.
      }
    });

    this.ws.addEventListener("close", () => {
      this.ws = null;
      this.onConnectionState(false);
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => this.openSocket(), 2000);
      }
    });
  }
}
