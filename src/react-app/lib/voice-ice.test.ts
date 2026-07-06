import { describe, expect, it, vi, afterEach } from "vitest";
import { buildIceServers } from "./voice-ice";

describe("buildIceServers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes default STUN servers", () => {
    vi.stubEnv("VITE_TURN_URL", "");
    const servers = buildIceServers();
    expect(servers.length).toBeGreaterThanOrEqual(3);
    expect(servers[0].urls).toBe("stun:stun.l.google.com:19302");
  });

  it("adds TURN when configured", () => {
    vi.stubEnv("VITE_TURN_URL", "turn:turn.example.com:3478");
    vi.stubEnv("VITE_TURN_USERNAME", "user");
    vi.stubEnv("VITE_TURN_CREDENTIAL", "pass");
    const servers = buildIceServers();
    expect(servers).toHaveLength(4);
    expect(servers[3]).toMatchObject({
      urls: "turn:turn.example.com:3478",
      username: "user",
      credential: "pass",
    });
  });
});
