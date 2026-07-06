import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { subscribePush, showNativeNotification } from "../lib/push-notifications";

export type NotificationType = "mention" | "message" | "dm" | "voice-invite";

export interface PushNotificationOptions {
  title: string;
  body: string;
  type: NotificationType;
  channelId?: string;
  serverId?: string;
}

interface ToastItem extends PushNotificationOptions {
  id: string;
}

interface NotificationContextValue {
  pushNotification: (options: PushNotificationOptions) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const MAX_TOASTS = 5;
const TOAST_DURATION_MS = 5000;

let audioContext: AudioContext | null = null;

function playNotificationSound() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    const ctx = audioContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch {
    // Audio unavailable.
  }
}

function shouldPlaySound(type: NotificationType): boolean {
  if (type !== "mention" && type !== "dm" && type !== "voice-invite") {
    return false;
  }
  const tabHidden = document.hidden || !document.hasFocus();
  return tabHidden || type === "mention";
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    void subscribePush();
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushNotification = useCallback(
    (options: PushNotificationOptions) => {
      const id = crypto.randomUUID();
      setToasts((current) => {
        const next = [{ ...options, id }, ...current];
        return next.slice(0, MAX_TOASTS);
      });

      if (shouldPlaySound(options.type)) {
        playNotificationSound();
      }

      showNativeNotification(options.title, options.body);

      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  return (
    <NotificationContext.Provider value={{ pushNotification }}>
      {children}
      <div className="notification-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`notification-toast notification-toast-${toast.type}`}
            role="status"
          >
            <div className="notification-toast-content">
              <strong className="notification-toast-title">{toast.title}</strong>
              <p className="notification-toast-body">{toast.body}</p>
            </div>
            <button
              type="button"
              className="notification-toast-dismiss"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}
