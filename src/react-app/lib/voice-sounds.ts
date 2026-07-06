let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(frequency: number, durationMs: number, volume = 0.08) {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  void ctx.resume().catch(() => undefined);

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + durationMs / 1000);
}

export function playVoiceConnectSound() {
  playTone(440, 90);
  window.setTimeout(() => playTone(660, 110), 95);
}

export function playVoiceDisconnectSound() {
  playTone(520, 100);
  window.setTimeout(() => playTone(320, 140), 90);
}

export function playVoiceErrorSound() {
  playTone(220, 160, 0.1);
}
