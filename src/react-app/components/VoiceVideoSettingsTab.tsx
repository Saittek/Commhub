import { useEffect, useRef, useState } from "react";
import { useVoice } from "../context/VoiceContext";
import {
  buildAudioConstraints,
  DEFAULT_VOICE_VIDEO_PREFERENCES,
  deviceLabel,
  effectiveProcessing,
  enumerateMediaDevices,
  getVoiceVideoPreferences,
  INPUT_PROFILES,
  profileProcessing,
  profileSensitivity,
  requestAudioPermission,
  requestCameraPermission,
  saveVoiceVideoPreferences,
  speakingThreshold,
  supportsOutputSelection,
  type InputProfile,
  type VoiceProcessingSettings,
  type VoiceVideoPreferences,
} from "../lib/voice-video-settings";
import { VoiceAudioPipeline, webAudioPresetForSettings } from "../lib/voice-audio-pipeline";

export type VoiceSettingsFocus = "microphone" | "headphones";

interface VoiceVideoSettingsTabProps {
  focus?: VoiceSettingsFocus;
}

function processingFromProfile(
  profile: InputProfile,
  current: VoiceProcessingSettings,
): VoiceProcessingSettings {
  if (profile === "custom") {
    return current;
  }
  return profileProcessing(profile);
}

export default function VoiceVideoSettingsTab({ focus }: VoiceVideoSettingsTabProps) {
  const voice = useVoice();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [prefs, setPrefs] = useState<VoiceVideoPreferences>(DEFAULT_VOICE_VIDEO_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micWouldTransmit, setMicWouldTransmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);
  const testPipelineRef = useRef<VoiceAudioPipeline | null>(null);
  const testContextRef = useRef<AudioContext | null>(null);
  const testIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micSectionRef = useRef<HTMLDivElement | null>(null);
  const headphoneSectionRef = useRef<HTMLElement | null>(null);
  const outputSupported = supportsOutputSelection();
  const isCustomProfile = prefs.inputProfile === "custom";
  const activeWebAudio = webAudioPresetForSettings(prefs);
  const hasEnhancedProcessing =
    activeWebAudio.highPassHz !== null ||
    activeWebAudio.compressor !== null ||
    activeWebAudio.noiseGateThreshold !== null;

  function updatePrefs(patch: Partial<VoiceVideoPreferences>) {
    setPrefs((current) => ({ ...current, ...patch }));
  }

  function updateProcessing(patch: Partial<VoiceProcessingSettings>) {
    setPrefs((current) => ({
      ...current,
      processing: { ...current.processing, ...patch },
    }));
  }

  function selectProfile(profile: InputProfile) {
    setPrefs((current) => ({
      ...current,
      inputProfile: profile,
      processing: processingFromProfile(profile, current.processing),
      voiceActivitySensitivity:
        profile === "custom" ? current.voiceActivitySensitivity : profileSensitivity(profile),
    }));
  }

  async function loadDevices() {
    setLoading(true);
    setError(null);

    try {
      await requestAudioPermission();
      await requestCameraPermission();
      const devices = await enumerateMediaDevices();
      setInputs(devices.inputs);
      setOutputs(devices.outputs);
      setCameras(devices.cameras);

      const stored = getVoiceVideoPreferences();
      const next: VoiceVideoPreferences = {
        ...stored,
        inputDeviceId:
          stored.inputDeviceId &&
          devices.inputs.some((device) => device.deviceId === stored.inputDeviceId)
            ? stored.inputDeviceId
            : "",
        outputDeviceId:
          stored.outputDeviceId &&
          devices.outputs.some((device) => device.deviceId === stored.outputDeviceId)
            ? stored.outputDeviceId
            : "",
        cameraDeviceId:
          stored.cameraDeviceId &&
          devices.cameras.some((device) => device.deviceId === stored.cameraDeviceId)
            ? stored.cameraDeviceId
            : "",
      };
      setPrefs(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list devices.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDevices();

    function handleDeviceChange() {
      void loadDevices();
    }

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      stopMicTest();
    };
  }, []);

  useEffect(() => {
    if (!focus || loading) {
      return;
    }

    const target =
      focus === "microphone" ? micSectionRef.current : headphoneSectionRef.current;
    if (!target) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("voice-settings-focus");
      timer = window.setTimeout(() => {
        target.classList.remove("voice-settings-focus");
      }, 1400);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      target.classList.remove("voice-settings-focus");
    };
  }, [focus, loading]);

  function stopMicTest() {
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

    setTestingMic(false);
    setMicLevel(0);
    setMicWouldTransmit(false);
  }

  async function handleTestMic() {
    if (testingMic) {
      stopMicTest();
      return;
    }

    setError(null);

    try {
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
      const vadThreshold = speakingThreshold(prefs.voiceActivitySensitivity);
      testIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buffer);
        const average = buffer.reduce((sum, value) => sum + value, 0) / buffer.length;
        setMicLevel(Math.min(100, Math.round((average / 80) * 100)));
        setMicWouldTransmit(!prefs.pushToTalk && average > vadThreshold);
      }, 80);

      setTestingMic(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone test failed.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      saveVoiceVideoPreferences(prefs);
      await voice.updateVoiceVideoSettings(prefs);
      setMessage("Voice & video settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-form voice-video-settings">
      <h3>Voice & Video</h3>
      <p className="settings-muted">
        Configure your microphone, headset, camera, and input profile. Saved on this device and
        used in voice channels.
      </p>

      {loading ? (
        <p className="settings-muted">Loading devices...</p>
      ) : (
        <>
          <div ref={micSectionRef} className="voice-settings-target">
            <section className="voice-video-section">
              <h4>Input Profile</h4>
            <p className="settings-muted">
              Choose how your microphone is processed before it is sent to voice channels.
            </p>
            <div className="input-profile-grid">
              {INPUT_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  className={
                    prefs.inputProfile === profile.id
                      ? "input-profile-card active"
                      : "input-profile-card"
                  }
                  onClick={() => selectProfile(profile.id)}
                  disabled={saving}
                >
                  <strong>{profile.label}</strong>
                  <span>{profile.description}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="voice-video-section">
            <h4>Voice Processing</h4>
            {isCustomProfile ? (
              <>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={prefs.processing.noiseSuppression}
                    onChange={(event) =>
                      updateProcessing({ noiseSuppression: event.target.checked })
                    }
                    disabled={saving}
                  />
                  Noise suppression
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={prefs.processing.echoCancellation}
                    onChange={(event) =>
                      updateProcessing({ echoCancellation: event.target.checked })
                    }
                    disabled={saving}
                  />
                  Echo cancellation
                </label>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={prefs.processing.autoGainControl}
                    onChange={(event) =>
                      updateProcessing({ autoGainControl: event.target.checked })
                    }
                    disabled={saving}
                  />
                  Automatic gain control
                </label>
              </>
            ) : (
              <ul className="voice-profile-summary">
                <li>
                  Noise suppression:{" "}
                  {effectiveProcessing(prefs).noiseSuppression ? "On" : "Off"}
                </li>
                <li>
                  Echo cancellation:{" "}
                  {effectiveProcessing(prefs).echoCancellation ? "On" : "Off"}
                </li>
                <li>
                  Automatic gain control:{" "}
                  {effectiveProcessing(prefs).autoGainControl ? "On" : "Off"}
                </li>
                <li>Input mode: {prefs.pushToTalk ? "Push-to-talk" : "Voice activity"}</li>
                {hasEnhancedProcessing && (
                  <li>Enhanced filtering: high-pass, compression, and noise gate</li>
                )}
              </ul>
            )}
            {!prefs.pushToTalk && (
              <label>
                Voice activity sensitivity
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.voiceActivitySensitivity}
                  onChange={(event) =>
                    updatePrefs({ voiceActivitySensitivity: Number(event.target.value) })
                  }
                  disabled={saving}
                />
                <span className="settings-muted">
                  Higher values require louder speech before your mic transmits ({prefs.voiceActivitySensitivity})
                </span>
              </label>
            )}
            {prefs.pushToTalk && (
              <p className="settings-muted">
                Voice activity sensitivity is disabled while push-to-talk is on.
              </p>
            )}
          </section>

          <section className="voice-video-section">
            <h4>Input Mode</h4>
            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={prefs.pushToTalk}
                onChange={(event) => updatePrefs({ pushToTalk: event.target.checked })}
                disabled={saving}
              />
              Push to talk (hold Space in voice channels)
            </label>
            <p className="settings-muted">
              When enabled, your mic only transmits while you hold Space. Channel owners can still
              require push-to-talk on specific voice channels.
            </p>
          </section>

          <section className="voice-video-section">
            <h4>Microphone</h4>
            <label>
              Input device
              <select
                value={prefs.inputDeviceId}
                onChange={(event) => updatePrefs({ inputDeviceId: event.target.value })}
                disabled={saving}
              >
                <option value="">System default</option>
                {inputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {deviceLabel(device, "Microphone")}
                  </option>
                ))}
              </select>
            </label>

            <div className="audio-device-test">
              <button type="button" className="secondary-button" onClick={() => void handleTestMic()}>
                {testingMic ? "Stop Mic Test" : "Test Microphone"}
              </button>
              <div className="audio-device-meter" aria-hidden="true">
                <div
                  className="audio-device-meter-threshold"
                  style={{
                    left: `${Math.min(100, (speakingThreshold(prefs.voiceActivitySensitivity) / 80) * 100)}%`,
                  }}
                />
                <div className="audio-device-meter-fill" style={{ width: `${micLevel}%` }} />
              </div>
              {testingMic && !prefs.pushToTalk && (
                <span className={`settings-muted mic-vad-status${micWouldTransmit ? " active" : ""}`}>
                  {micWouldTransmit ? "Mic would transmit" : "Below voice activity threshold"}
                </span>
              )}
            </div>
          </section>
          </div>

          <section
            ref={headphoneSectionRef}
            className="voice-video-section voice-settings-target"
          >
            <h4>Headset / Speakers</h4>
            <label>
              Output device
              <select
                value={prefs.outputDeviceId}
                onChange={(event) => updatePrefs({ outputDeviceId: event.target.value })}
                disabled={saving || !outputSupported}
              >
                <option value="">System default</option>
                {outputs.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {deviceLabel(device, "Output")}
                  </option>
                ))}
              </select>
            </label>

            {!outputSupported && (
              <p className="settings-muted">
                Your browser does not support choosing a separate headset output.
              </p>
            )}
          </section>

          <section className="voice-video-section">
            <h4>Camera</h4>
            <label>
              Video device
              <select
                value={prefs.cameraDeviceId}
                onChange={(event) => updatePrefs({ cameraDeviceId: event.target.value })}
                disabled={saving}
              >
                <option value="">System default</option>
                {cameras.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {deviceLabel(device, "Camera")}
                  </option>
                ))}
              </select>
            </label>
            <p className="settings-muted">
              Used when you turn on your camera in voice channels. Change it here or from Voice &amp;
              Video settings.
            </p>
          </section>
        </>
      )}

      {error && <div className="settings-error">{error}</div>}
      {message && <div className="settings-success">{message}</div>}

      <button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
        {saving ? "Saving..." : "Save Voice & Video Settings"}
      </button>
    </div>
  );
}
