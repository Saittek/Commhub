import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import {
  AVATAR_CROP_PREVIEW_SIZE,
  clampAvatarOffset,
  exportCroppedAvatarFile,
  loadImageFromFile,
  renderAvatarCropToCanvas,
  type AvatarCropState,
  type LoadedCropImage,
} from "../lib/avatar-crop";

interface AvatarCropModalProps {
  file: File;
  onClose: () => void;
  onApply: (file: File) => Promise<void>;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export default function AvatarCropModal({ file, onClose, onApply }: AvatarCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<AvatarCropState>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const [cropImage, setCropImage] = useState<LoadedCropImage | null>(null);
  const [crop, setCrop] = useState<AvatarCropState>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  cropRef.current = crop;

  useEffect(() => {
    let cancelled = false;
    let loaded: LoadedCropImage | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setCropImage(null);
      setCrop({ offsetX: 0, offsetY: 0, zoom: 1 });

      try {
        loaded = await loadImageFromFile(file);
        if (cancelled) {
          loaded.bitmap.close();
          URL.revokeObjectURL(loaded.previewUrl);
          return;
        }

        setCropImage(loaded);
        setCrop(
          clampAvatarOffset(
            loaded.width,
            loaded.height,
            AVATAR_CROP_PREVIEW_SIZE,
            0,
            0,
            1,
          ),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load image.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (loaded) {
        loaded.bitmap.close();
        URL.revokeObjectURL(loaded.previewUrl);
      }
    };
  }, [file]);

  useEffect(() => {
    if (!cropImage || loading) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    renderAvatarCropToCanvas(
      context,
      cropImage.bitmap,
      cropImage.width,
      cropImage.height,
      crop,
      AVATAR_CROP_PREVIEW_SIZE,
    );
  }, [cropImage, crop, loading]);

  function updateCrop(next: AvatarCropState) {
    if (!cropImage) {
      setCrop(next);
      return;
    }

    setCrop(
      clampAvatarOffset(
        cropImage.width,
        cropImage.height,
        AVATAR_CROP_PREVIEW_SIZE,
        next.offsetX,
        next.offsetY,
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next.zoom)),
      ),
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!cropImage || loading) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: crop.offsetX,
      originY: crop.offsetY,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active || !cropImage) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    updateCrop({
      offsetX: dragRef.current.originX + deltaX,
      offsetY: dragRef.current.originY + deltaY,
      zoom: crop.zoom,
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) {
      return;
    }

    dragRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (!cropImage || loading) {
      return;
    }

    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.08 : -0.08;
    updateCrop({ ...crop, zoom: crop.zoom + delta });
  }

  async function handleApply() {
    if (!cropImage) {
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const cropped = await exportCroppedAvatarFile(cropImage, cropRef.current);
      await onApply(cropped);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save avatar.");
    } finally {
      setApplying(false);
    }
  }

  const modal = (
    <div className="settings-overlay avatar-crop-overlay" onClick={onClose}>
      <div
        className="avatar-crop-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-labelledby="avatar-crop-title"
      >
        <header className="avatar-crop-header">
          <h2 id="avatar-crop-title">Adjust your avatar</h2>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="settings-muted avatar-crop-copy">
          Drag to reposition, scroll or use the slider to zoom. What you see in the circle is what
          gets saved.
        </p>

        <div
          className="avatar-crop-viewport"
          style={{ width: AVATAR_CROP_PREVIEW_SIZE, height: AVATAR_CROP_PREVIEW_SIZE }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            className="avatar-crop-canvas"
            width={AVATAR_CROP_PREVIEW_SIZE}
            height={AVATAR_CROP_PREVIEW_SIZE}
            aria-hidden={loading}
          />
          {loading && <div className="avatar-crop-loading">Loading image...</div>}
        </div>

        <label className="avatar-crop-zoom">
          <span className="avatar-crop-zoom-label">
            <span>Zoom</span>
            <span className="avatar-crop-zoom-value">{crop.zoom.toFixed(2)}×</span>
          </span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            disabled={!cropImage || loading || applying}
            onChange={(event) =>
              updateCrop({ ...crop, zoom: Number(event.target.value) })
            }
          />
        </label>

        {error && <div className="settings-error">{error}</div>}

        <div className="avatar-crop-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={applying}>
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleApply()}
            disabled={!cropImage || loading || applying}
          >
            {applying ? "Saving..." : "Apply Avatar"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
