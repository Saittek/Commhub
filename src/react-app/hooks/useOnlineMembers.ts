import { useCallback, useEffect, useState } from "react";
import { getOnlineMembers, heartbeatServerPresence, type OnlineMember } from "../lib/api";

const REFRESH_MS = 15_000;

export function useOnlineMembers(serverId: string | null) {
  const [members, setMembers] = useState<OnlineMember[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!serverId) {
      setMembers([]);
      setOnlineCount(0);
      return;
    }

    try {
      setError(null);
      void heartbeatServerPresence(serverId);
      const response = await getOnlineMembers(serverId);
      setMembers(response.members);
      setOnlineCount(response.onlineCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load online members.");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setOnlineCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();

    const refreshTimer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);

    return () => {
      window.clearInterval(refreshTimer);
    };
  }, [refresh, serverId]);

  return { members, onlineCount, loading, error, refresh };
}
