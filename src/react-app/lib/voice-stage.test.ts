import { describe, expect, it } from "vitest";
import { hasVoiceStageVideo, shouldShowVoiceStage } from "./voice-stage";

const emptyLocal = {
  cameraStream: null,
  screenStream: null,
  cameraEnabled: false,
  screenSharing: false,
};

describe("hasVoiceStageVideo", () => {
  it("detects local camera", () => {
    expect(
      hasVoiceStageVideo({ ...emptyLocal, cameraEnabled: true }, []),
    ).toBe(true);
  });

  it("detects remote screen share", () => {
    expect(
      hasVoiceStageVideo(emptyLocal, [
        {
          userId: "u1",
          displayName: "Ada",
          cameraStream: null,
          screenStream: {} as MediaStream,
        },
      ]),
    ).toBe(true);
  });
});

describe("shouldShowVoiceStage", () => {
  it("shows when connected and local or remote video is active", () => {
    expect(
      shouldShowVoiceStage({
        joined: { channelId: "c1" },
        connectionState: "connected",
        localMedia: { ...emptyLocal, cameraEnabled: true },
        remoteMedia: [],
      }),
    ).toBe(true);

    expect(
      shouldShowVoiceStage({
        joined: { channelId: "c1" },
        connectionState: "connected",
        localMedia: emptyLocal,
        remoteMedia: [
          {
            userId: "u1",
            displayName: "Ada",
            cameraStream: {} as MediaStream,
            screenStream: null,
          },
        ],
      }),
    ).toBe(true);
  });

  it("hides for audio-only voice even when connected", () => {
    expect(
      shouldShowVoiceStage({
        joined: { channelId: "c1" },
        connectionState: "connecting",
        localMedia: emptyLocal,
        remoteMedia: [],
      }),
    ).toBe(false);

    expect(
      shouldShowVoiceStage({
        joined: { channelId: "c1" },
        connectionState: "connected",
        localMedia: emptyLocal,
        remoteMedia: [],
      }),
    ).toBe(false);
  });

  it("hides when not in a voice session", () => {
    expect(
      shouldShowVoiceStage({
        joined: null,
        connectionState: "disconnected",
        localMedia: emptyLocal,
        remoteMedia: [],
      }),
    ).toBe(false);
  });
});
