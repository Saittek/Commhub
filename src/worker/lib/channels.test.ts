import { describe, expect, it } from "vitest";
import { MAX_VOICE_CHANNEL_USERS, resolveVoiceUserLimit, validateUpdateChannel } from "./channels";

describe("resolveVoiceUserLimit", () => {
  it("uses platform max when unset", () => {
    expect(resolveVoiceUserLimit(0)).toBe(MAX_VOICE_CHANNEL_USERS);
  });

  it("caps per-channel limits above platform max", () => {
    expect(resolveVoiceUserLimit(99)).toBe(MAX_VOICE_CHANNEL_USERS);
  });

  it("keeps lower per-channel limits", () => {
    expect(resolveVoiceUserLimit(10)).toBe(10);
  });
});

describe("validateUpdateChannel voice user limit", () => {
  it("rejects limits above platform max", () => {
    expect(validateUpdateChannel({ voiceUserLimit: 99 })).toMatch(/25/);
  });

  it("accepts valid limits", () => {
    expect(validateUpdateChannel({ voiceUserLimit: 12 })).toBeNull();
  });
});
