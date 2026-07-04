/**
 * Screen capture helpers based on the MDN Screen Capture API guidance:
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
 *
 * Browsers only accept simple constraints for getDisplayMedia (typically `video: true`).
 */

export type ScreenCaptureFailureCode =
  | "insecure-context"
  | "unsupported"
  | "denied"
  | "unknown";

export class ScreenCaptureError extends Error {
  readonly code: ScreenCaptureFailureCode;

  constructor(message: string, code: ScreenCaptureFailureCode) {
    super(message);
    this.name = "ScreenCaptureError";
    this.code = code;
  }
}

type LegacyNavigator = Navigator & {
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  mediaDevices?: MediaDevices & {
    getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
};

export function isScreenCaptureSupported(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (!window.isSecureContext) {
    return false;
  }

  return getDisplayMediaFn() !== null;
}

export function screenCaptureSupportMessage(): string | null {
  if (typeof window === "undefined") {
    return "Screen sharing is only available in the browser.";
  }

  if (!window.isSecureContext) {
    return "Screen sharing needs a secure connection. Open CommHub via https:// or http://localhost (not a LAN IP address).";
  }

  if (!getDisplayMediaFn()) {
    return "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox on desktop.";
  }

  return null;
}

function getDisplayMediaFn():
  | ((constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>)
  | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const nav = navigator as LegacyNavigator;
  const modern = nav.mediaDevices?.getDisplayMedia?.bind(nav.mediaDevices);
  if (modern) {
    return modern;
  }

  const legacy = nav.getDisplayMedia?.bind(navigator);
  if (legacy) {
    return legacy;
  }

  return null;
}

function normalizeScreenCaptureError(error: unknown): ScreenCaptureError {
  if (error instanceof ScreenCaptureError) {
    return error;
  }

  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "AbortError") {
      return new ScreenCaptureError("Screen sharing was cancelled.", "denied");
    }

    if (error.name === "NotSupportedError" || error.name === "SecurityError") {
      return new ScreenCaptureError(
        screenCaptureSupportMessage() ??
          "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox on desktop.",
        "unsupported",
      );
    }
  }

  if (error instanceof Error && /not supported/i.test(error.message)) {
    return new ScreenCaptureError(
      screenCaptureSupportMessage() ??
        "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox on desktop.",
      "unsupported",
    );
  }

  if (error instanceof Error && error.message) {
    return new ScreenCaptureError(error.message, "unknown");
  }

  return new ScreenCaptureError("Could not start screen sharing.", "unknown");
}

export async function requestScreenCaptureStream(): Promise<MediaStream> {
  const supportMessage = screenCaptureSupportMessage();
  if (supportMessage) {
    throw new ScreenCaptureError(supportMessage, supportMessage.includes("secure") ? "insecure-context" : "unsupported");
  }

  const getDisplayMedia = getDisplayMediaFn();
  if (!getDisplayMedia) {
    throw new ScreenCaptureError(
      "Screen sharing is not supported in this browser. Use Chrome, Edge, or Firefox on desktop.",
      "unsupported",
    );
  }

  // MDN: keep options minimal. Advanced track constraints must be applied after capture.
  const attempts: DisplayMediaStreamOptions[] = [{ video: true, audio: false }, { video: true }];

  let lastError: unknown = null;
  for (const options of attempts) {
    try {
      return await getDisplayMedia(options);
    } catch (error) {
      lastError = error;
      const normalized = normalizeScreenCaptureError(error);
      if (normalized.code === "denied") {
        throw normalized;
      }
    }
  }

  throw normalizeScreenCaptureError(lastError);
}
