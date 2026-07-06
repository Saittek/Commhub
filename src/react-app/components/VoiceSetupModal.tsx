import { useEffect, useRef, useState } from "react";
import {
  buildAudioConstraints,
  DEFAULT_VOICE_VIDEO_PREFERENCES,
  effectiveProcessing,
  enumerateMediaDevices,
  getVoiceVideoPreferences,
  requestAudioPermission,
  saveVoiceVideoPreferences,
} from "../lib/voice-video-settings";
import { VoiceAudioPipeline } from "../lib/voice-audio-pipeline";

export const VOICE_SETUP_DONE_KEY = "commhub_voice_setup_done";

interface VoiceSetupModalProps {
  onComplete: () => void;
}

export default function VoiceSetupModal({ onComplete }: VoiceSetupModalProps) {
  const [micLevel, setMicLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testPipelineRef = useRef<VoiceAudioPipeline | null>(null);
  const testContextRef = useRef<AudioContext | null>(null);
  const testIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTest() {
    if (testIntervalRef.current) {
      clearInterval(testIntervalRef.current);
      testIntervalRef.current = null;
    }
    if (testContextRef.current) {
      void testContextRef.current.close();
      testContextRef.current = null;
    }
    if (testStreamRef.current) {
      for (const track of testStreamRef.current.getTracks()) {
        track.stop();
      }
      testStreamRef.current = null;
    }
    testPipelineRef.current?.stop(false);
    testPipelineRef.current = null;
    setTesting(false);
    setMicLevel(0);
  }

  useEffect(() => () => stopTest(), []);

  async function handleTestMic() {
    if (testing) {
      stopTest();
      return;
    }

    setError(null);
    try {
      await requestAudioPermission();
      await enumerateMediaDevices();
      const prefs = getVoiceVideoPreferences();
      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(prefs.inputDeviceId, effectiveProcessing(prefs)),
        video: false,
      });
      testStreamRef.current = rawStream;
      const pipeline = new VoiceAudioPipeline();
      testPipelineRef.current = pipeline;
      const processedStream = pipeline.process(rawStream, prefs);
      const context = new AudioContext();
      testContextRef.current = context;
      const source = context.createMediaStreamSource(processedStream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      testIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buffer);
        const average = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
        setMicLevel(Math.min(100, Math.round((average / 80) * 100)));
      }, 80);
      setTesting(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone test failed.");
    }
  }

  async function handleContinue() {
    setSaving(true);
    setError(null);
    try {
      const prefs = getVoiceVideoPreferences();
      saveVoiceVideoPreferences({ ...DEFAULT_VOICE_VIDEO_PREFERENCES, ...prefs });
      localStorage.setItem(VOICE_SETUP_DONE_KEY, "1");
      stopTest();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-overlay voice-setup-overlay">
      <div className="channel-settings-modal voice-setup-modal" role="dialog" aria-label="Voice setup">
        <div className="channel-settings-header">
          <h2>Set up your microphone</h2>
        </div>
        <p className="settings-muted">
          Test your mic before joining voice channels. You can change input profile and devices later in
          Voice &amp; Video settings.
        </p>
        <div className="audio-device-test">
          <button type="button" className="secondary-button" onClick={() => void handleTestMic()}>
            {testing ? "Stop Mic Test" : "Test Microphone"}
          </button>
          <div className="audio-device-meter" aria-hidden="true">
            <div className="audio-device-meter-fill" style={{ width: `${micLevel}%` }} />
          </div>
        </div>
        {error && <div className="settings-error">{error}</div>}
        <div className="channel-settings-actions">
          <button type="button" className="primary-button" disabled={saving} onClick={() => void handleContinue()}>
            {saving ? "Saving..." : "Continue to Commhub"}
          </button>
        </div>
      </div>
    </div>
  );
}
