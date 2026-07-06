import { describe, expect, it } from "vitest";
import {
  noiseGateThresholdForSensitivity,
  speakingThreshold,
} from "./voice-video-settings";

describe("speakingThreshold", () => {
  it("is lower for more sensitive settings", () => {
    expect(speakingThreshold(0)).toBeGreaterThan(speakingThreshold(100));
  });

  it("clamps out-of-range values", () => {
    expect(speakingThreshold(-10)).toBe(speakingThreshold(0));
    expect(speakingThreshold(150)).toBe(speakingThreshold(100));
  });
});

describe("noiseGateThresholdForSensitivity", () => {
  it("raises the gate threshold as sensitivity increases", () => {
    const base = 0.02;
    expect(noiseGateThresholdForSensitivity(base, 80)).toBeGreaterThan(
      noiseGateThresholdForSensitivity(base, 20),
    );
  });
});
