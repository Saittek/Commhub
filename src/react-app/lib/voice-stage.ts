import type { LocalVoiceMedia, RemoteVoiceMedia } from "./voice-client";
import type { VoiceConnectionState } from "./voice-client";

export function hasVoiceStageVideo(
  localMedia: LocalVoiceMedia,
  remoteMedia: RemoteVoiceMedia[],
): boolean {
  return (
    localMedia.cameraEnabled ||
    localMedia.screenSharing ||
    remoteMedia.some((item) => item.cameraStream || item.screenStream)
  );
}

export function shouldShowVoiceStage(input: {
  joined: unknown;
  connectionState: VoiceConnectionState;
  localMedia: LocalVoiceMedia;
  remoteMedia: RemoteVoiceMedia[];
}): boolean {
  if (!input.joined || input.connectionState === "disconnected") {
    return false;
  }
  return hasVoiceStageVideo(input.localMedia, input.remoteMedia);
}
