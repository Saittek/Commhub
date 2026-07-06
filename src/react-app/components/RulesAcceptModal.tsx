import { useEffect, useState } from "react";
import { acceptServerRules, getServerRules } from "../lib/api";

interface RulesAcceptModalProps {
  serverId: string;
  serverName: string;
  onAccepted: () => void;
}

export default function RulesAcceptModal({
  serverId,
  serverName,
  onAccepted,
}: RulesAcceptModalProps) {
  const [rulesText, setRulesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getServerRules(serverId)
      .then((r) => setRulesText(r.rulesText))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load rules."))
      .finally(() => setLoading(false));
  }, [serverId]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      await acceptServerRules(serverId);
      onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept rules.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="settings-overlay rules-overlay">
      <div className="rules-accept-modal">
        <h2>Server Rules — {serverName}</h2>
        {loading && <p>Loading rules...</p>}
        {error && <div className="settings-error">{error}</div>}
        {!loading && (
          <div className="rules-accept-body">
            {rulesText ? (
              <pre className="rules-text">{rulesText}</pre>
            ) : (
              <p className="settings-muted">This server requires you to accept the rules before participating.</p>
            )}
          </div>
        )}
        <button type="button" className="primary-button" onClick={() => void handleAccept()} disabled={accepting}>
          {accepting ? "..." : "I Agree"}
        </button>
      </div>
    </div>
  );
}
