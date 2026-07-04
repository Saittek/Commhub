import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { createServer, joinServer } from "../lib/api";

type OnboardingMode = "join" | "create";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const initialMode =
    location.state && typeof location.state === "object" && "mode" in location.state
      ? (location.state.mode as OnboardingMode)
      : "create";
  const [mode, setMode] = useState<OnboardingMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverName, setServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await createServer(serverName);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create server.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await joinServer(inviteCode);
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card onboarding-card">
        <div className="auth-brand">
          <div className="auth-logo">C</div>
          <h1>Welcome, {user?.username}</h1>
          <p>Join an existing server or create one to get started.</p>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "create" ? "active" : ""}
            onClick={() => {
              setMode("create");
              setError(null);
            }}
          >
            Create a Server
          </button>
          <button
            type="button"
            className={mode === "join" ? "active" : ""}
            onClick={() => {
              setMode("join");
              setError(null);
            }}
          >
            Join a Server
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {mode === "create" ? (
          <form className="auth-form" onSubmit={handleCreate}>
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
              />
            </label>
            <p className="onboarding-hint">
              You will be the owner. Share the invite code with friends once your server is created.
            </p>
            <button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Server"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleJoin}>
            <label>
              Invite Code
              <input
                type="text"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                placeholder="ABCD1234"
                required
                minLength={4}
              />
            </label>
            <p className="onboarding-hint">
              Ask a server owner for their invite code to join their community.
            </p>
            <button type="submit" disabled={submitting}>
              {submitting ? "Joining..." : "Join Server"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
