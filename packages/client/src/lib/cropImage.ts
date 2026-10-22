/**
 * Client-side image crop + compress helpers. The interactive geometry lives in
 * ImageCropModal; this module holds the pure pieces: loading a File into an
 * <img>, and rendering a chosen source rectangle into a small square WebP Blob.
 *
 * Compressing here (256px, WebP q≈0.82) keeps every uploaded logo/avatar to a
 * few KB on disk — the server stores bytes as-is (no image lib), so the client
 * is where sizing happens.
 */

export function loadImageFromFile(file: File): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    image.src = url;
  });
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Draw a source rectangle of `image` into a `size`×`size` canvas and encode it
 *  as a WebP Blob. Falls back to PNG if the browser can't encode WebP. */
export async function renderCropToBlob(
  image: HTMLImageElement,
  crop: CropRect,
  size = 256,
  quality = 0.82,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size, size);

  const encode = (type: string): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));

  const webp = await encode('image/webp');
  if (webp && webp.type === 'image/webp') return webp;
  const png = await encode('image/png');
  if (png) return png;
  throw new Error('Failed to encode image');
}
