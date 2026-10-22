import path from 'path';
import fs from 'fs';
import { dataDir } from '../db/index.js';

/** Uploaded images (account avatars, merchant logos) live under <dataDir>/uploads
 *  and are served statically at /uploads. */
export const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Raster formats only. SVG is intentionally excluded: it can carry <script>,
// and uploads are served same-origin, so allowing it would enable stored XSS.
const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

/** Verify the buffer's leading magic bytes actually match the claimed raster
 *  type — the multipart mimetype is client-controlled and must not be trusted. */
function magicMatches(mime: string, buf: Buffer): boolean {
  if (buf.length < 12) return false;
  switch (mime) {
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46; // GIF
    case 'image/webp':
      // RIFF....WEBP
      return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
    default:
      return false;
  }
}

/** Save an uploaded image as `<prefix>-<id>.<ext>` (replacing any prior file for
 *  that prefix+id) and return its served URL. Throws on an unsupported type or
 *  when the bytes don't match the declared image format. */
export function saveImage(prefix: string, id: number | string, file: { mimetype: string; buffer: Buffer }): string {
  // HTTP media types are case-insensitive; normalize before the (lowercase) lookup.
  const mime = (file.mimetype || '').toLowerCase();
  const ext = EXT[mime];
  if (!ext) throw new Error('Unsupported image type');
  if (!magicMatches(mime, file.buffer)) throw new Error('File contents do not match image type');
  for (const f of fs.readdirSync(uploadsDir)) {
    if (f.startsWith(`${prefix}-${id}.`)) { try { fs.unlinkSync(path.join(uploadsDir, f)); } catch { /* ignore */ } }
  }
  const fname = `${prefix}-${id}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, fname), file.buffer);
  return `/uploads/${fname}`;
}

export interface RemoteImageResult {
  url: string | null;
  keyRejected: boolean;
}

/** Fetch a remote image URL and store it via saveImage(). The caller receives a
 *  keyRejected flag only for upstream 401/403 responses; all other failures
 *  (including 404) remain ordinary cache misses. Used for logo.dev downloads. */
export async function saveImageFromUrl(prefix: string, id: number | string, url: string): Promise<RemoteImageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000); // bound a hung upstream
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (resp.status === 401 || resp.status === 403) return { url: null, keyRejected: true };
    if (!resp.ok) return { url: null, keyRejected: false };
    const mimetype = (resp.headers.get('content-type') || '').split(';')[0].trim();
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length === 0) return { url: null, keyRejected: false };
    return { url: saveImage(prefix, id, { mimetype, buffer }), keyRejected: false };
  } catch {
    return { url: null, keyRejected: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Remove a previously-served upload by its URL (safe no-op if missing/outside dir). */
export function deleteImage(url: string | null | undefined): void {
  if (!url) return;
  const p = path.join(uploadsDir, path.basename(url));
  if (p.startsWith(uploadsDir) && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch { /* ignore */ } }
}
