export interface ServerBoostPerks {
  boostCount: number;
  boostLevel: number;
  uploadLimitMb: number;
  emojiSlots: number;
  soundboardSlots: number;
}

function computeBoostLevel(count: number): number {
  if (count >= 14) return 3;
  if (count >= 7) return 2;
  if (count >= 2) return 1;
  return 0;
}

export async function getServerBoostPerks(
  db: D1Database,
  serverId: string,
): Promise<ServerBoostPerks> {
  const row = await db
    .prepare("SELECT boost_count, boost_level FROM servers WHERE id = ? LIMIT 1")
    .bind(serverId)
    .first<{ boost_count: number; boost_level: number }>();

  const boostCount = row?.boost_count ?? 0;
  const boostLevel = row?.boost_level ?? computeBoostLevel(boostCount);

  return {
    boostCount,
    boostLevel,
    uploadLimitMb: boostLevel >= 2 ? 50 : 25,
    emojiSlots: 50 + boostLevel * 25,
    soundboardSlots: 8 + boostLevel * 4,
  };
}

export function uploadLimitBytes(perks: ServerBoostPerks): number {
  return perks.uploadLimitMb * 1024 * 1024;
}
