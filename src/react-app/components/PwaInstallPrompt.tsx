import { useEffect, useState } from "react";

const DISMISS_KEY = "commhub-pwa-install-dismissed";

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) {
      return;
    }

    function handleBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    setVisible(false);
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="pwa-install-banner" role="status">
      <div>
        <strong>Install Commhub</strong>
        <p className="settings-muted">Add to your home screen for faster access and notifications.</p>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="secondary-button" onClick={handleDismiss}>
          Not now
        </button>
        <button type="button" className="primary-button" onClick={() => void handleInstall()}>
          Install
        </button>
      </div>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}
