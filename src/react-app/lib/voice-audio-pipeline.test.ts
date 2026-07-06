import { describe, expect, it } from "vitest";
import {
  webAudioPresetForProfile,
  webAudioPresetForSettings,
} from "./voice-audio-pipeline";
import { DEFAULT_VOICE_VIDEO_PREFERENCES } from "./voice-video-settings";

describe("webAudioPresetForProfile", () => {
  it("uses an aggressive chain for voice isolation", () => {
    const preset = webAudioPresetForProfile("voice-isolation");
    expect(preset.highPassHz).toBeGreaterThan(0);
    expect(preset.compressor).not.toBeNull();
    expect(preset.noiseGateThreshold).not.toBeNull();
  });

  it("keeps balanced on browser processing only", () => {
    const preset = webAudioPresetForProfile("balanced");
    expect(preset.highPassHz).toBeNull();
    expect(preset.compressor).toBeNull();
    expect(preset.noiseGateThreshold).toBeNull();
  });

  it("keeps studio raw without extra processing", () => {
    const preset = webAudioPresetForProfile("studio");
    expect(preset.highPassHz).toBeNull();
    expect(preset.compressor).toBeNull();
    expect(preset.noiseGateThreshold).toBeNull();
  });
});

describe("webAudioPresetForSettings", () => {
  it("maps custom all-off to raw", () => {
    const preset = webAudioPresetForSettings({
      ...DEFAULT_VOICE_VIDEO_PREFERENCES,
      inputProfile: "custom",
      processing: {
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
      },
    });
    expect(preset.highPassHz).toBeNull();
  });

  it("maps custom noise suppression to a light chain", () => {
    const preset = webAudioPresetForSettings({
      ...DEFAULT_VOICE_VIDEO_PREFERENCES,
      inputProfile: "custom",
      processing: {
        noiseSuppression: true,
        echoCancellation: false,
        autoGainControl: false,
      },
    });
    expect(preset.highPassHz).not.toBeNull();
  });
});
