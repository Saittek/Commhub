import { FormEvent, useEffect, useState } from "react";
import {
  createServer,
  getPublicServers,
  joinPublicServer,
  joinServer,
  type PublicServer,
  type Server,
} from "../lib/api";
import ServerIcon from "./ServerIcon";

type HubStep = "menu" | "create" | "join";
type JoinTab = "code" | "discover";

interface ServerHubModalProps {
  onClose: () => void;
  onServerCreated: (server: Server) => void;
  onServerJoined: (server: Server) => void;
}

export default function ServerHubModal({
  onClose,
  onServerCreated,
  onServerJoined,
}: ServerHubModalProps) {
  const [step, setStep] = useState<HubStep>("menu");
  const [joinTab, setJoinTab] = useState<JoinTab>("code");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  const [publicServers, setPublicServers] = useState<PublicServer[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "join" || joinTab !== "discover") {
      return;
    }

    let cancelled = false;

    async function loadPublicServers() {
      setLoadingPublic(true);
      setPublicError(null);

      try {
        const response = await getPublicServers();
        if (!cancelled) {
          setPublicServers(response.servers);
        }
      } catch (err) {
        if (!cancelled) {
          setPublicError(err instanceof Error ? err.message : "Could not load public servers.");
        }
      } finally {
        if (!cancelled) {
          setLoadingPublic(false);
        }
      }
    }

    void loadPublicServers();

    return () => {
      cancelled = true;
    };
  }, [step, joinTab]);

  function resetError() {
    setError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetError();
    setSubmitting(true);

    try {
      const response = await createServer(serverName.trim());
      onServerCreated(response.server);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetError();
    setSubmitting(true);

    try {
      const response = await joinServer(inviteCode.trim());
      onServerJoined(response.server);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinPublic(serverId: string) {
    resetError();
    setSubmitting(true);

    try {
      const response = await joinPublicServer(serverId);
      onServerJoined(response.server);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join server.");
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    step === "menu" ? "Add a Server" : step === "create" ? "Create a Server" : "Join a Server";

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className={`channel-settings-modal server-hub-modal${step === "join" && joinTab === "discover" ? " server-hub-modal-wide" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="channel-settings-header">
          <div className="server-hub-header">
            {step !== "menu" && (
              <button
                type="button"
                className="server-hub-back"
                onClick={() => {
                  setStep("menu");
                  resetError();
                }}
              >
                ← Back
              </button>
            )}
            <h2>{title}</h2>
          </div>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {step === "menu" && (
          <div className="server-hub-menu">
            <p className="settings-muted">
              Start a new community or join one with an invite code or the public directory.
            </p>
            <div className="server-hub-actions">
              <button
                type="button"
                className="server-hub-action-card"
                onClick={() => {
                  setStep("create");
                  resetError();
                }}
              >
                <span className="server-hub-action-icon" aria-hidden="true">
                  +
                </span>
                <strong>Create Server</strong>
                <span>Start your own community with channels and voice.</span>
              </button>
              <button
                type="button"
                className="server-hub-action-card"
                onClick={() => {
                  setStep("join");
                  setJoinTab("code");
                  resetError();
                }}
              >
                <span className="server-hub-action-icon server-hub-action-icon-join" aria-hidden="true">
                  →
                </span>
                <strong>Join Server</strong>
                <span>Use an invite code or browse public servers.</span>
              </button>
            </div>
          </div>
        )}

        {step === "create" && (
          <form className="channel-settings-form" onSubmit={handleCreate}>
            {error && <div className="settings-error">{error}</div>}

            <label>
              Server Name
              <input
                type="text"
                value={serverName}
                onChange={(event) => setServerName(event.target.value)}
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
              <button
                type="button"
                className="channel-create-cancel"
                onClick={() => setStep("menu")}
                disabled={submitting}
              >
                Back
              </button>
              <button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Server"}
              </button>
            </div>
          </form>
        )}

        {step === "join" && (
          <div className="server-hub-join">
            <div className="auth-tabs server-hub-join-tabs">
              <button
                type="button"
                className={joinTab === "code" ? "active" : ""}
                onClick={() => {
                  setJoinTab("code");
                  resetError();
                }}
              >
                Invite Code
              </button>
              <button
                type="button"
                className={joinTab === "discover" ? "active" : ""}
                onClick={() => {
                  setJoinTab("discover");
                  resetError();
                }}
              >
                Public Servers
              </button>
            </div>

            {error && <div className="settings-error">{error}</div>}

            {joinTab === "code" ? (
              <form className="channel-settings-form" onSubmit={handleJoinCode}>
                <label>
                  Invite Code
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    placeholder="ABCD1234"
                    required
                    minLength={4}
                    autoFocus
                  />
                </label>
                <p className="onboarding-hint">
                  Ask a server owner for their invite code to join their community.
                </p>
                <div className="channel-settings-actions">
                  <button
                    type="button"
                    className="channel-create-cancel"
                    onClick={() => setStep("menu")}
                    disabled={submitting}
                  >
                    Back
                  </button>
                  <button type="submit" disabled={submitting}>
                    {submitting ? "Joining..." : "Join Server"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="server-hub-discover">
                {loadingPublic && <p className="settings-muted">Loading public servers...</p>}
                {publicError && <div className="settings-error">{publicError}</div>}
                {!loadingPublic && !publicError && publicServers.length === 0 && (
                  <p className="settings-muted server-hub-empty">
                    No public servers yet. Owners can list their server in Server Settings →
                    Invites.
                  </p>
                )}
                {!loadingPublic && publicServers.length > 0 && (
                  <ul className="public-server-list">
                    {publicServers.map((server) => (
                      <li key={server.id} className="public-server-card">
                        <ServerIcon
                          serverName={server.name}
                          iconUrl={server.iconUrl}
                          size="settings"
                        />
                        <div className="public-server-card-body">
                          <div className="public-server-card-head">
                            <strong>{server.name}</strong>
                            <span className="public-server-member-count">
                              {server.memberCount} member{server.memberCount === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="public-server-description">
                            {server.description.trim() || "No description yet."}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="secondary-button public-server-join-btn"
                          onClick={() => void handleJoinPublic(server.id)}
                          disabled={submitting}
                        >
                          Join
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="channel-settings-actions">
                  <button
                    type="button"
                    className="channel-create-cancel"
                    onClick={() => setStep("menu")}
                    disabled={submitting}
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
