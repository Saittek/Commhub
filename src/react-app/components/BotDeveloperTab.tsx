import { FormEvent, useEffect, useState } from "react";
import {
  createApplication,
  getApplications,
  regenerateBotToken,
  type BotApplication,
} from "../lib/api";

export default function BotDeveloperTab() {
  const [apps, setApps] = useState<BotApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  function loadApps() {
    setLoading(true);
    void getApplications()
      .then((response) => setApps(response.applications))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load applications."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadApps();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await createApplication(name.trim(), description.trim());
      setRevealedToken(response.token);
      setName("");
      setDescription("");
      loadApps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create application.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate(appId: string) {
    if (!window.confirm("Regenerate token? The old token will stop working immediately.")) {
      return;
    }
    setError(null);
    try {
      const response = await regenerateBotToken(appId);
      setRevealedToken(response.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate token.");
    }
  }

  return (
    <div className="developer-tab">
      <h3>Developer Applications</h3>
      <p className="settings-muted">
        Create bot applications to integrate with Commhub servers. Your token is shown only once
        after creation or regeneration.
      </p>

      {error && <div className="settings-error">{error}</div>}

      {revealedToken && (
        <div className="developer-token-reveal">
          <strong>Bot token (copy now — it won&apos;t be shown again)</strong>
          <code className="developer-token-code">{revealedToken}</code>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void navigator.clipboard.writeText(revealedToken);
            }}
          >
            Copy
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setRevealedToken(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <form className="developer-create-form" onSubmit={handleCreate}>
        <label>
          Application Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Bot"
            required
            maxLength={32}
          />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this bot do?"
            rows={2}
          />
        </label>
        <button type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Creating…" : "Create Application"}
        </button>
      </form>

      <h4>Your Applications</h4>
      {loading && <p className="settings-muted">Loading…</p>}
      <div className="developer-app-list">
        {apps.map((app) => (
          <div key={app.id} className="developer-app-card">
            <div>
              <strong>{app.name}</strong>
              {app.description && <p className="settings-muted">{app.description}</p>}
              <code className="developer-app-id">{app.id}</code>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void handleRegenerate(app.id)}
            >
              Regenerate Token
            </button>
          </div>
        ))}
        {!loading && apps.length === 0 && (
          <p className="settings-muted">No applications yet.</p>
        )}
      </div>
    </div>
  );
}
