import { FormEvent, useEffect, useState } from "react";
import {
  endActivity,
  getActivities,
  updateActivityMetadata,
  type ActivitySession,
} from "../lib/api";
import { parseWatchTogetherMetadata, toYouTubeEmbedUrl } from "../lib/watch-together";

interface WatchTogetherModalProps {
  serverId: string;
  channelId: string;
  onClose: () => void;
}

export default function WatchTogetherModal({
  serverId,
  channelId,
  onClose,
}: WatchTogetherModalProps) {
  const [activities, setActivities] = useState<ActivitySession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [savingUrl, setSavingUrl] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await getActivities(serverId);
        if (!cancelled) {
          setActivities(response.activities.filter((item) => item.channelId === channelId));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load activities.");
        }
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [serverId, channelId]);

  const active = activities[0] ?? null;
  const metadata = parseWatchTogetherMetadata(active?.metadata);
  const embedUrl = metadata.videoUrl ? toYouTubeEmbedUrl(metadata.videoUrl) : null;

  async function handleSetVideo(event: FormEvent) {
    event.preventDefault();
    if (!active || !urlDraft.trim()) {
      return;
    }
    setSavingUrl(true);
    setError(null);
    try {
      await updateActivityMetadata(serverId, active.id, { videoUrl: urlDraft.trim() });
      setUrlDraft("");
      const response = await getActivities(serverId);
      setActivities(response.activities.filter((item) => item.channelId === channelId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update video.");
    } finally {
      setSavingUrl(false);
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="channel-settings-modal watch-together-modal watch-together-modal-wide"
        role="dialog"
        aria-label="Watch Together"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="channel-settings-header">
          <h2>Watch Together</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {error && <div className="settings-error">{error}</div>}
        {active ? (
          <div className="watch-together-active">
            <p className="settings-muted">
              Hosted by <strong>{active.host.displayName}</strong>. Paste a YouTube link below to share
              with everyone in this voice channel.
            </p>
            <form className="watch-together-url-form" onSubmit={(event) => void handleSetVideo(event)}>
              <input
                type="url"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
              <button type="submit" className="primary-button" disabled={savingUrl || !urlDraft.trim()}>
                {savingUrl ? "Saving..." : "Set video"}
              </button>
            </form>
            {embedUrl ? (
              <div className="watch-together-player">
                <iframe
                  src={embedUrl}
                  title="Watch Together"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : metadata.videoUrl ? (
              <p className="settings-muted">Only YouTube links are supported for embedded playback right now.</p>
            ) : (
              <p className="settings-muted">No video selected yet.</p>
            )}
            <button
              type="button"
              className="secondary-button"
              disabled={ending}
              onClick={() => {
                setEnding(true);
                void endActivity(serverId, active.id)
                  .then(() => onClose())
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : "Could not end activity."),
                  )
                  .finally(() => setEnding(false));
              }}
            >
              End activity
            </button>
          </div>
        ) : (
          <p className="settings-muted app-modal-empty">
            No active Watch Together session. Start one from the Activities menu when you are in voice.
          </p>
        )}
      </div>
    </div>
  );
}
