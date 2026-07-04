import { AVATAR_SIZE } from "./avatar";

export const AVATAR_CROP_PREVIEW_SIZE = 256;

export interface AvatarCropState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface LoadedCropImage {
  bitmap: ImageBitmap;
  previewUrl: string;
  width: number;
  height: number;
}

export function coverScale(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
): number {
  return Math.max(viewportSize / imageWidth, viewportSize / imageHeight);
}

export function imageRectInViewport(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
) {
  const scale = coverScale(imageWidth, imageHeight, viewportSize) * zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const left = viewportSize / 2 + offsetX - width / 2;
  const top = viewportSize / 2 + offsetY - height / 2;

  return { left, top, width, height, scale };
}

export function clampAvatarOffset(
  imageWidth: number,
  imageHeight: number,
  viewportSize: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): AvatarCropState {
  const rect = imageRectInViewport(
    imageWidth,
    imageHeight,
    viewportSize,
    offsetX,
    offsetY,
    zoom,
  );
  const radius = viewportSize / 2;
  const center = viewportSize / 2;

  let nextOffsetX = offsetX;
  let nextOffsetY = offsetY;

  if (rect.left > center - radius) {
    nextOffsetX -= rect.left - (center - radius);
  }
  if (rect.top > center - radius) {
    nextOffsetY -= rect.top - (center - radius);
  }
  if (rect.left + rect.width < center + radius) {
    nextOffsetX += center + radius - (rect.left + rect.width);
  }
  if (rect.top + rect.height < center + radius) {
    nextOffsetY += center + radius - (rect.top + rect.height);
  }

  return {
    offsetX: nextOffsetX,
    offsetY: nextOffsetY,
    zoom,
  };
}

export async function loadImageFromFile(file: File): Promise<LoadedCropImage> {
  const previewUrl = URL.createObjectURL(file);

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      bitmap.close();
      throw new Error("Could not read image file.");
    }

    return {
      bitmap,
      previewUrl,
      width: bitmap.width,
      height: bitmap.height,
    };
  } catch {
    URL.revokeObjectURL(previewUrl);
    throw new Error("Could not read image file.");
  }
}

export function renderAvatarCropToCanvas(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  state: AvatarCropState,
  viewportSize: number,
) {
  context.clearRect(0, 0, viewportSize, viewportSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  const rect = imageRectInViewport(
    imageWidth,
    imageHeight,
    viewportSize,
    state.offsetX,
    state.offsetY,
    state.zoom,
  );

  context.save();
  context.beginPath();
  context.arc(viewportSize / 2, viewportSize / 2, viewportSize / 2, 0, Math.PI * 2);
  context.clip();
  context.drawImage(source, rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

export async function exportCroppedAvatarFile(
  source: LoadedCropImage,
  state: AvatarCropState,
  previewSize = AVATAR_CROP_PREVIEW_SIZE,
  outputSize = AVATAR_SIZE,
): Promise<File> {
  const stage = document.createElement("canvas");
  stage.width = previewSize;
  stage.height = previewSize;
  const stageContext = stage.getContext("2d");
  if (!stageContext) {
    throw new Error("Could not prepare avatar image.");
  }

  renderAvatarCropToCanvas(
    stageContext,
    source.bitmap,
    source.width,
    source.height,
    state,
    previewSize,
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare avatar image.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(stage, 0, 0, previewSize, previewSize, 0, 0, outputSize, outputSize);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error("Could not create avatar image."));
          return;
        }
        resolve(result);
      },
      "image/png",
      0.92,
    );
  });

  return new File([blob], "avatar.png", { type: "image/png" });
}
