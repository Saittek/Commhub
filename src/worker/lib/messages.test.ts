import { describe, expect, it } from "vitest";
import { countUnreadMessagesForServer } from "./messages";

describe("countUnreadMessagesForServer", () => {
  it("returns unread counts keyed by channel id", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              { channel_id: "ch-1", unread_count: 3 },
              { channel_id: "ch-2", unread_count: 0 },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;

    const unread = await countUnreadMessagesForServer(db, "server-1", "user-1");
    expect(unread).toEqual({ "ch-1": 3, "ch-2": 0 });
  });
});
