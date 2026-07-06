const PREFS_KEY = "commhub_voice_video_settings";
const LEGACY_INPUT_KEY = "commhub_audio_input";
const LEGACY_OUTPUT_KEY = "commhub_audio_output";

export type InputProfile = "balanced" | "voice-isolation" | "studio" | "custom";

export interface VoiceProcessingSettings {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

export interface VoiceVideoPreferences {
  inputDeviceId: string;
  outputDeviceId: string;
  cameraDeviceId: string;
  inputProfile: InputProfile;
  processing: VoiceProcessingSettings;
  pushToTalk: boolean;
  voiceActivitySensitivity: number;
}

export const INPUT_PROFILES: {
  id: InputProfile;
  label: string;
  description: string;
}[] = [
  {
    id: "balanced",
    label: "Balanced",
    description: "Good for most rooms. Noise suppression and voice activity enabled.",
  },
  {
    id: "voice-isolation",
    label: "Voice Isolation",
    description: "Aggressive noise filtering for loud environments and keyboard noise.",
  },
  {
    id: "studio",
    label: "Studio / Raw",
    description: "Minimal processing for high-quality mics and quiet spaces.",
  },
  {
    id: "custom",
    label: "Custom",
    description: "Tune noise suppression, echo cancellation, and gain yourself.",
  },
];

const DEFAULT_PROCESSING: VoiceProcessingSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export const DEFAULT_VOICE_VIDEO_PREFERENCES: VoiceVideoPreferences = {
  inputDeviceId: "",
  outputDeviceId: "",
  cameraDeviceId: "",
  inputProfile: "balanced",
  processing: { ...DEFAULT_PROCESSING },
  pushToTalk: false,
  voiceActivitySensitivity: 55,
};

export function profileProcessing(profile: InputProfile): VoiceProcessingSettings {
  switch (profile) {
    case "voice-isolation":
      return {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
      };
    case "studio":
      return {
        noiseSuppression: false,
        echoCancellation: false,
        autoGainControl: false,
      };
    case "custom":
      return getVoiceVideoPreferences().processing;
    case "balanced":
    default:
      return { ...DEFAULT_PROCESSING };
  }
}

export function profileSensitivity(profile: InputProfile): number {
  switch (profile) {
    case "voice-isolation":
      return 78;
    case "studio":
      return 42;
    case "balanced":
      return 55;
    case "custom":
      return getVoiceVideoPreferences().voiceActivitySensitivity;
    default:
      return 55;
  }
}

export function effectiveProcessing(prefs: VoiceVideoPreferences): VoiceProcessingSettings {
  if (prefs.inputProfile === "custom") {
    return prefs.processing;
  }
  return profileProcessing(prefs.inputProfile);
}

export function effectiveSensitivity(prefs: VoiceVideoPreferences): number {
  return prefs.voiceActivitySensitivity;
}

export function speakingThreshold(sensitivity: number): number {
  const clamped = Math.min(100, Math.max(0, sensitivity));
  return 35 - (clamped / 100) * 27;
}

/** Scale a noise-gate RMS threshold from voice activity sensitivity (0 = sensitive, 100 = strict). */
export function noiseGateThresholdForSensitivity(
  baseThreshold: number,
  sensitivity: number,
): number {
  const clamped = Math.min(100, Math.max(0, sensitivity));
  const scale = 0.5 + (clamped / 100) * 2;
  return baseThreshold * scale;
}

export function getVoiceVideoPreferences(): VoiceVideoPreferences {
  const raw = localStorage.getItem(PREFS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<VoiceVideoPreferences>;
      return {
        ...DEFAULT_VOICE_VIDEO_PREFERENCES,
        ...parsed,
        processing: {
          ...DEFAULT_PROCESSING,
          ...parsed.processing,
        },
      };
    } catch {
      // Fall through to legacy migration.
    }
  }

  return {
    ...DEFAULT_VOICE_VIDEO_PREFERENCES,
    inputDeviceId: localStorage.getItem(LEGACY_INPUT_KEY) ?? "",
    outputDeviceId: localStorage.getItem(LEGACY_OUTPUT_KEY) ?? "",
  };
}

export function saveVoiceVideoPreferences(prefs: VoiceVideoPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  localStorage.removeItem(LEGACY_INPUT_KEY);
  localStorage.removeItem(LEGACY_OUTPUT_KEY);
}

export function buildAudioConstraints(
  deviceId: string,
  processing: VoiceProcessingSettings,
): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: processing.echoCancellation,
    noiseSuppression: processing.noiseSuppression,
    autoGainControl: processing.autoGainControl,
  };

  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }

  return constraints;
}

export function buildVideoConstraints(deviceId: string): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 24, max: 30 },
  };

  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  } else {
    constraints.facingMode = "user";
  }

  return constraints;
}

export async function requestAudioPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    return false;
  }
}

export async function requestCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    return false;
  }
}

export async function enumerateMediaDevices(): Promise<{
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  cameras: MediaDeviceInfo[];
}> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: devices.filter((device) => device.kind === "audioinput"),
    outputs: devices.filter((device) => device.kind === "audiooutput"),
    cameras: devices.filter((device) => device.kind === "videoinput"),
  };
}

export function deviceLabel(device: MediaDeviceInfo, fallback: string): string {
  if (device.label) {
    return device.label;
  }
  return `${fallback} (${device.deviceId.slice(0, 8)}…)`;
}

type SinkCapableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export function supportsOutputSelection(): boolean {
  const probe = document.createElement("audio") as SinkCapableAudio;
  return typeof probe.setSinkId === "function";
}

export async function applyOutputDevice(
  audio: HTMLAudioElement,
  deviceId: string,
): Promise<void> {
  const sinkAudio = audio as SinkCapableAudio;
  if (!deviceId || typeof sinkAudio.setSinkId !== "function") {
    return;
  }

  try {
    await sinkAudio.setSinkId(deviceId);
  } catch {
    // Browser may reject invalid or unavailable output devices.
  }
}

// Backward-compatible aliases used by voice client imports.
export type AudioDevicePreferences = Pick<
  VoiceVideoPreferences,
  "inputDeviceId" | "outputDeviceId"
>;

export function getAudioDevicePreferences(): AudioDevicePreferences {
  const prefs = getVoiceVideoPreferences();
  return {
    inputDeviceId: prefs.inputDeviceId,
    outputDeviceId: prefs.outputDeviceId,
  };
}

export function saveAudioDevicePreferences(prefs: AudioDevicePreferences): void {
  saveVoiceVideoPreferences({
    ...getVoiceVideoPreferences(),
    ...prefs,
  });
}
