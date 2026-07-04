import { FormEvent, useState } from "react";
import { createServer } from "../lib/api";
import type { Server } from "../lib/api";

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: (server: Server) => void;
}

export default function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await createServer(name.trim());
      onCreated(response.server);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="channel-settings-modal" onClick={(event) => event.stopPropagation()}>
        <div className="channel-settings-header">
          <h2>Create a Server</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="channel-settings-form" onSubmit={handleSubmit}>
          {error && <div className="settings-error">{error}</div>}

          <label>
            Server Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My Awesome Server"
              required
              minLength={2}
              maxLength={32}
              autoFocus
            />
          </label>

          <p className="onboarding-hint">
            You will be the owner. A #general channel is created automatically.
          </p>

          <div className="channel-settings-actions">
            <button type="button" className="channel-create-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
