import { saveImageFromUrl, type RemoteImageResult } from './uploads.js';

export type LogoFetchResult = RemoteImageResult;

/** True when a logo.dev token is configured (LOGODEV_TOKEN). Without it, logo
 *  hydration is a no-op and institutions render brand-colored monograms. */
export function logoDevConfigured(): boolean {
  return !!(process.env.LOGODEV_TOKEN && process.env.LOGODEV_TOKEN.trim());
}

/** Normalize to a bare host (no scheme, no www, no path) for logo.dev. */
export function normalizeDomain(domain: string): string {
  return (domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/** Build the logo.dev image URL for a domain: WebP, 256px, retina, and a 404
 *  (not a generated monogram) when no logo exists — so we fall back to our own
 *  monogram instead of caching logo.dev's placeholder. */
export function logoDevUrl(domain: string): string {
  const token = (process.env.LOGODEV_TOKEN || '').trim();
  const d = normalizeDomain(domain);
  // 256px, non-retina: crisp at our largest avatar (56px) while staying a few KB
  // on disk (matches the client crop output). retina would 2x the pixels + bytes.
  return `https://img.logo.dev/${encodeURIComponent(d)}?token=${encodeURIComponent(token)}&format=webp&size=256&retina=false&fallback=404`;
}

/** Fetch + cache a logo from logo.dev under `<prefix>-<id>.<ext>`. A rejected
 *  key is distinct from a missing logo, network failure, or invalid image. */
export async function fetchLogo(prefix: string, id: number, domain: string | null | undefined): Promise<LogoFetchResult> {
  const d = normalizeDomain(domain || '');
  if (!logoDevConfigured() || !d) return { url: null, keyRejected: false };
  return saveImageFromUrl(prefix, id, logoDevUrl(d));
}

/** Institution logo → `institution-<id>.webp`. */
export function fetchInstitutionLogo(id: number, domain: string | null | undefined): Promise<LogoFetchResult> {
  return fetchLogo('institution', id, domain);
}

/** Vendor (merchant catalog) logo → `vendor-<id>.webp`. */
export function fetchVendorLogo(id: number, domain: string | null | undefined): Promise<LogoFetchResult> {
  return fetchLogo('vendor', id, domain);
}
