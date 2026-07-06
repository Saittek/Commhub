import { subscribePush as apiSubscribePush } from "./api";

export async function requestPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribePush(): Promise<boolean> {
  const permission = await requestPermission();
  if (permission !== "granted") {
    return false;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return true;
  }

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidKey) {
    return true;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return false;
    }

    await apiSubscribePush({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return true;
  } catch {
    return false;
  }
}

export function showNativeNotification(title: string, body: string): void {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }
  const tabHidden = document.hidden || !document.hasFocus();
  if (!tabHidden) {
    return;
  }
  try {
    new Notification(title, { body });
  } catch {
    // Notification API unavailable.
  }
}
