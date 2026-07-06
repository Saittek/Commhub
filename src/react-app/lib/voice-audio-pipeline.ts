import {
  effectiveProcessing,
  effectiveSensitivity,
  noiseGateThresholdForSensitivity,
  type InputProfile,
  type VoiceVideoPreferences,
} from "./voice-video-settings";

export interface WebAudioPreset {
  highPassHz: number | null;
  compressor: {
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
  } | null;
  noiseGateThreshold: number | null;
}

const EMPTY_PRESET: WebAudioPreset = {
  highPassHz: null,
  compressor: null,
  noiseGateThreshold: null,
};

const VOICE_ISOLATION_PRESET: WebAudioPreset = {
  highPassHz: 120,
  compressor: {
    threshold: -22,
    knee: 10,
    ratio: 10,
    attack: 0.002,
    release: 0.12,
  },
  noiseGateThreshold: 0.014,
};

const CUSTOM_NOISE_SUPPRESSION_PRESET: WebAudioPreset = {
  highPassHz: 100,
  compressor: {
    threshold: -26,
    knee: 14,
    ratio: 6,
    attack: 0.003,
    release: 0.16,
  },
  noiseGateThreshold: 0.018,
};

export function webAudioPresetForProfile(profile: InputProfile): WebAudioPreset {
  switch (profile) {
    case "voice-isolation":
      return VOICE_ISOLATION_PRESET;
    case "studio":
    case "balanced":
    default:
      return EMPTY_PRESET;
  }
}

export function webAudioPresetForSettings(prefs: VoiceVideoPreferences): WebAudioPreset {
  if (prefs.inputProfile === "custom") {
    const processing = effectiveProcessing(prefs);
    if (!processing.noiseSuppression && !processing.echoCancellation && !processing.autoGainControl) {
      return EMPTY_PRESET;
    }
    if (processing.noiseSuppression) {
      return CUSTOM_NOISE_SUPPRESSION_PRESET;
    }
    return EMPTY_PRESET;
  }

  return webAudioPresetForProfile(prefs.inputProfile);
}

export class VoiceAudioPipeline {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private highPass: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private gateGain: GainNode | null = null;
  private gateAnalyser: AnalyserNode | null = null;
  private gateInterval: ReturnType<typeof setInterval> | null = null;
  private gateThreshold = 0;
  private rawStream: MediaStream | null = null;

  process(rawStream: MediaStream, prefs: VoiceVideoPreferences): MediaStream {
    this.stop(false);

    this.rawStream = rawStream;
    const preset = webAudioPresetForSettings(prefs);

    if (
      preset.highPassHz === null &&
      preset.compressor === null &&
      preset.noiseGateThreshold === null
    ) {
      return rawStream;
    }

    this.context = new AudioContext();
    this.source = this.context.createMediaStreamSource(rawStream);
    this.destination = this.context.createMediaStreamDestination();

    let tail: AudioNode = this.source;

    if (preset.highPassHz !== null) {
      this.highPass = this.context.createBiquadFilter();
      this.highPass.type = "highpass";
      this.highPass.frequency.value = preset.highPassHz;
      this.highPass.Q.value = 0.7;
      tail.connect(this.highPass);
      tail = this.highPass;
    }

    if (preset.compressor !== null) {
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = preset.compressor.threshold;
      this.compressor.knee.value = preset.compressor.knee;
      this.compressor.ratio.value = preset.compressor.ratio;
      this.compressor.attack.value = preset.compressor.attack;
      this.compressor.release.value = preset.compressor.release;
      tail.connect(this.compressor);
      tail = this.compressor;
    }

    if (preset.noiseGateThreshold !== null) {
      this.gateGain = this.context.createGain();
      this.gateGain.gain.value = 0.02;
      this.gateAnalyser = this.context.createAnalyser();
      this.gateAnalyser.fftSize = 512;
      this.gateAnalyser.smoothingTimeConstant = 0.4;
      tail.connect(this.gateAnalyser);
      tail.connect(this.gateGain);
      this.gateThreshold = noiseGateThresholdForSensitivity(
        preset.noiseGateThreshold,
        effectiveSensitivity(prefs),
      );
      this.startNoiseGate();
      tail = this.gateGain;
    }

    tail.connect(this.destination);

    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    return this.destination.stream;
  }

  private startNoiseGate() {
    const analyser = this.gateAnalyser;
    const gain = this.gateGain;
    const context = this.context;
    if (!analyser || !gain || !context) {
      return;
    }

    const buffer = new Uint8Array(analyser.fftSize);
    this.gateInterval = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const sample = (buffer[index] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / buffer.length);
      const target = rms > this.gateThreshold ? 1 : 0.02;
      gain.gain.setTargetAtTime(target, context.currentTime, 0.02);
    }, 25);
  }

  stop(stopRawStream = true) {
    if (this.gateInterval) {
      clearInterval(this.gateInterval);
      this.gateInterval = null;
    }

    this.source?.disconnect();
    this.highPass?.disconnect();
    this.compressor?.disconnect();
    this.gateGain?.disconnect();
    this.gateAnalyser?.disconnect();
    this.destination?.disconnect();

    this.source = null;
    this.highPass = null;
    this.compressor = null;
    this.gateGain = null;
    this.gateAnalyser = null;
    this.destination = null;

    if (this.context) {
      void this.context.close();
      this.context = null;
    }

    if (stopRawStream && this.rawStream) {
      for (const track of this.rawStream.getTracks()) {
        track.stop();
      }
      this.rawStream = null;
    }
  }
}

export async function applyAudioTrackConstraints(
  track: MediaStreamTrack,
  processing: ReturnType<typeof effectiveProcessing>,
): Promise<boolean> {
  try {
    await track.applyConstraints({
      echoCancellation: processing.echoCancellation,
      noiseSuppression: processing.noiseSuppression,
      autoGainControl: processing.autoGainControl,
    });
    return true;
  } catch {
    return false;
  }
}
