import type { DmMessage } from "./api";

export type DmSocketEvent =
  | { type: "connected" }
  | { type: "message-create"; message: DmMessage };

export class DmChannelClient {
  private socket: WebSocket | null = null;
  private channelId: string;
  private onEvent: (event: DmSocketEvent) => void;

  constructor(channelId: string, onEvent: (event: DmSocketEvent) => void) {
    this.channelId = channelId;
    this.onEvent = onEvent;
  }

  connect() {
    if (this.socket) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/dms/${this.channelId}/live`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as DmSocketEvent;
        this.onEvent(payload);
      } catch {
        // Ignore malformed frames.
      }
    });

    socket.addEventListener("close", () => {
      this.socket = null;
    });
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
  }
}
