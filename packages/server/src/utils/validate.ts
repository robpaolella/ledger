/** Small request-validation helpers shared by the route files. */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidYmd(v: unknown): v is string {
  if (typeof v !== 'string' || !YMD.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate();
}

/** True for a YYYY-MM month key. */
export function isValidMonth(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Coerce a body value to a finite number, or null. */
export function toFinite(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce to a positive integer id, or null. */
export function toId(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Clamp a paging integer parsed from the query string. */
export function clampInt(v: string | undefined, fallback: number, min: number, max: number): number {
  const n = parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Escape LIKE wildcards so a search for "100%" matches the literal text. Use with ESCAPE '\'. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Reject user-supplied regular expressions that can take exponential time on
 * the single-threaded server: overly long patterns and nested quantifiers
 * such as (a+)+ or (.*)*.
 */
export function unsafeRegexReason(pattern: string): string | null {
  if (pattern.length > 200) return 'Pattern is too long (max 200 characters)';
  if (/\([^()]*[+*][^()]*\)[+*{]/.test(pattern) || /[+*]\??[+*]/.test(pattern)) return 'Pattern uses nested repetition, which can hang matching';
  return null;
}

/** Today's date in the server's local timezone as YYYY-MM-DD. */
export function localYmd(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
