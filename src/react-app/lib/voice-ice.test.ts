import { describe, expect, it, vi, afterEach } from "vitest";
import { buildIceServers } from "./voice-ice";

describe("buildIceServers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("includes default STUN", () => {
    vi.stubEnv("VITE_TURN_URL", "");
    const servers = buildIceServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].urls).toBe("stun:stun.l.google.com:19302");
  });

  it("adds TURN when configured", () => {
    vi.stubEnv("VITE_TURN_URL", "turn:turn.example.com:3478");
    vi.stubEnv("VITE_TURN_USERNAME", "user");
    vi.stubEnv("VITE_TURN_CREDENTIAL", "pass");
    const servers = buildIceServers();
    expect(servers).toHaveLength(2);
    expect(servers[1]).toMatchObject({
      urls: "turn:turn.example.com:3478",
      username: "user",
      credential: "pass",
    });
  });
});
