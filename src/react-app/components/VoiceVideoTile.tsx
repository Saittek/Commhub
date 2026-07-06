import { useEffect, useRef } from "react";

interface VoiceVideoTileProps {
  stream: MediaStream;
  label: string;
  mirrored?: boolean;
  variant?: "camera" | "screen";
  featured?: boolean;
}

export default function VoiceVideoTile({
  stream,
  label,
  mirrored = false,
  variant = "camera",
  featured = false,
}: VoiceVideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    void video.play().catch(() => {
      // Autoplay may be blocked until user interaction; ignore.
    });

    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div
      className={`voice-video-tile voice-video-tile--${variant}${featured ? " voice-video-tile--featured" : ""}`}
    >
      <video
        ref={videoRef}
        className={`voice-video-element${mirrored ? " mirrored" : ""}`}
        autoPlay
        playsInline
        muted
      />
      <span className="voice-video-label">{label}</span>
    </div>
  );
}
