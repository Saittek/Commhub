import { useEffect, useState } from "react";
import { getAuditLog, type AuditLogEvent } from "../lib/api";

interface AuditLogTabProps {
  serverId: string;
}

function formatAction(action: string): string {
  return action.replace(/_/g, " ");
}

export default function AuditLogTab({ serverId }: AuditLogTabProps) {
  const [events, setEvents] = useState<AuditLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getAuditLog(serverId)
      .then((response) => setEvents(response.events))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load audit log.");
      })
      .finally(() => setLoading(false));
  }, [serverId]);

  if (loading) {
    return <p className="settings-muted">Loading audit log...</p>;
  }

  if (error) {
    return <div className="settings-error">{error}</div>;
  }

  return (
    <div className="settings-form">
      <h3>Audit Log</h3>
      <p className="settings-muted">Recent moderation and server safety actions.</p>

      {events.length === 0 ? (
        <p className="settings-muted">No audit events yet.</p>
      ) : (
        <div className="audit-log-list">
          {events.map((event) => (
            <div key={event.id} className="audit-log-row">
              <div className="audit-log-main">
                <strong>{formatAction(event.actionType)}</strong>
                {event.targetId && (
                  <span className="settings-muted">
                    {" "}
                    → {event.targetType ?? "target"} {event.targetId}
                  </span>
                )}
              </div>
              <div className="audit-log-meta settings-muted">
                {event.actorUsername ? `@${event.actorUsername}` : "System"} ·{" "}
                {new Date(event.createdAt).toLocaleString()}
                {event.reason ? ` · ${event.reason}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
