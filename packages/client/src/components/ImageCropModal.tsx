import { useCallback, useEffect, useRef, useState } from 'react';
import ResponsiveModal from './ResponsiveModal';
import { loadImageFromFile, renderCropToBlob, type CropRect } from '../lib/cropImage';

const VIEWPORT = 260; // on-screen crop square (px)
const OUTPUT = 256;   // exported square (px)
const MAX_ZOOM = 4;

/**
 * Interactive crop + compress: drag to reposition, scroll/slider to zoom, then
 * export a small square WebP Blob (256px). Shared by every image upload —
 * account avatars, merchant logos, and institution logos.
 */
export default function ImageCropModal({
  file,
  title = 'Crop image',
  circular = true,
  onCancel,
  onCropped,
}: {
  file: File;
  title?: string;
  circular?: boolean;
  onCancel: () => void;
  onCropped: (blob: Blob) => void | Promise<void>;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  // Display scale at zoom=1 (image "covers" viewport). State, not a ref — it
  // sizes the <img> during render.
  const [baseScale, setBaseScale] = useState(1);
  const revokeRef = useRef<() => void>(() => {});
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const scaleFor = useCallback((z: number) => baseScale * z, [baseScale]);

  const clamp = useCallback((o: { x: number; y: number }, scale: number, image: HTMLImageElement) => {
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    return {
      x: Math.min(0, Math.max(VIEWPORT - w, o.x)),
      y: Math.min(0, Math.max(VIEWPORT - h, o.y)),
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setError(null);
    setImg(null);
    loadImageFromFile(file)
      .then(({ image, revoke }) => {
        if (!alive) { revoke(); return; }
        revokeRef.current = revoke;
        const base = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
        setBaseScale(base);
        setImg(image);
        setZoom(1);
        setOffset({
          x: (VIEWPORT - image.naturalWidth * base) / 2,
          y: (VIEWPORT - image.naturalHeight * base) / 2,
        });
      })
      .catch(() => { if (alive) setError('That file could not be read as an image.'); });
    return () => { alive = false; revokeRef.current(); };
  }, [file]);

  const applyZoom = (z: number) => {
    if (!img) return;
    const newZoom = Math.min(MAX_ZOOM, Math.max(1, z));
    const oldScale = scaleFor(zoom);
    const newScale = scaleFor(newZoom);
    // Keep the image point under the viewport center fixed.
    const cx = (VIEWPORT / 2 - offset.x) / oldScale;
    const cy = (VIEWPORT / 2 - offset.y) / oldScale;
    const next = clamp({ x: VIEWPORT / 2 - cx * newScale, y: VIEWPORT / 2 - cy * newScale }, newScale, img);
    setZoom(newZoom);
    setOffset(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !img) return;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    setOffset(clamp({ x: drag.current.ox + dx, y: drag.current.oy + dy }, scaleFor(zoom), img));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => { if (img) applyZoom(zoom - e.deltaY * 0.002); };

  const save = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const scale = scaleFor(zoom);
      const crop: CropRect = {
        sx: -offset.x / scale,
        sy: -offset.y / scale,
        sw: VIEWPORT / scale,
        sh: VIEWPORT / scale,
      };
      const blob = await renderCropToBlob(img, crop, OUTPUT);
      await onCropped(blob);
    } catch {
      setError('Could not process the image. Try a different file.');
      setBusy(false);
    }
  };

  return (
    <ResponsiveModal isOpen onClose={busy ? () => {} : onCancel} title={title} maxWidth="22rem">
      {error ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-content-2">{error}</p>
          <div className="flex justify-end">
            <button onClick={onCancel} className="h-11 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm">Close</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 items-center">
          <div
            className="relative overflow-hidden select-none touch-none bg-surface-2"
            style={{ width: VIEWPORT, height: VIEWPORT, borderRadius: 14, cursor: img ? 'grab' : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {img && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: img.naturalWidth * scaleFor(zoom),
                  height: img.naturalHeight * scaleFor(zoom),
                  maxWidth: 'none',
                }}
              />
            )}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: 'rgba(0,0,0,0.4)',
                WebkitMaskImage: circular
                  ? `radial-gradient(circle at center, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`
                  : undefined,
                maskImage: circular
                  ? `radial-gradient(circle at center, transparent ${VIEWPORT / 2 - 1}px, #000 ${VIEWPORT / 2}px)`
                  : undefined,
              }}
            />
          </div>

          <div className="w-full flex items-center gap-3">
            <span className="text-[11px] font-semibold text-content-3">Zoom</span>
            <input
              type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
              onChange={(e) => applyZoom(Number(e.target.value))}
              disabled={!img}
              className="flex-1 accent-[var(--primary)]"
            />
          </div>
          <p className="text-[11px] text-content-3 text-center">Drag to reposition · scroll to zoom</p>

          <div className="w-full flex items-center justify-end gap-2.5">
            <button type="button" onClick={onCancel} disabled={busy}
              className="h-11 px-4 rounded-[11px] border border-line-strong bg-surface-2 text-content font-semibold text-sm disabled:opacity-40">Cancel</button>
            <button type="button" onClick={save} disabled={!img || busy}
              className="h-11 px-5 rounded-[11px] bg-primary text-on-primary font-bold text-sm shadow-sm hover:bg-primary-hover disabled:opacity-60 inline-flex items-center gap-2">
              {busy && <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>}
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
