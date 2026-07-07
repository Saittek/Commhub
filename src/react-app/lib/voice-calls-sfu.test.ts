import { describe, expect, it } from "vitest";
import { buildIceServersForCalls } from "./voice-ice";
import { parseTrackName, trackNameFor } from "./voice-calls-sfu";

describe("buildIceServersForCalls", () => {
  it("prefers server-provided STUN servers", () => {
    const servers = buildIceServersForCalls([{ urls: "stun:stun.cloudflare.com:3478" }]);
    expect(servers).toEqual([{ urls: "stun:stun.cloudflare.com:3478" }]);
  });

  it("falls back to Cloudflare STUN", () => {
    expect(buildIceServersForCalls()).toEqual([{ urls: "stun:stun.cloudflare.com:3478" }]);
  });
});

describe("voice track naming", () => {
  it("maps screen shares to screen track names", () => {
    expect(trackNameFor("screen", "abc")).toBe("screen-abc");
    expect(parseTrackName("screen-abc")).toEqual({ kind: "screen", userId: "abc" });
  });
});
