/**
 * Canonical category identity — the single source of truth for a category's
 * emoji + categorical hue, used everywhere a category appears (transaction rows,
 * pills, chart series, legends, breakdowns).
 *
 * Hues are the 9 semantic `--c-*` tokens from the Retheme v2 theme (index.css),
 * so they stay balanced and respond to light/dark automatically. Keyed by the
 * category (`group_name`) level, normalized case-insensitively; covers both the
 * app's current seed names AND the design's canonical names so it works before
 * and after the category restructure (Wave 1b). Unknown names get a
 * deterministic hue + neutral emoji fallback.
 *
 * NOTE: once categories carry stored emoji/color columns (migration Wave 1b A),
 * server values take precedence and this becomes the fallback/seed source.
 */

import { useSyncExternalStore } from 'react';
import { apiFetch } from './api';

export type CategoryToken =
  | 'c-teal' | 'c-green' | 'c-blue' | 'c-indigo' | 'c-violet'
  | 'c-fuchsia' | 'c-rose' | 'c-orange' | 'c-amber';

export interface CategoryMeta {
  emoji: string;
  /** Categorical token name, e.g. 'c-blue' → utilities bg-c-blue / text-c-blue and var(--c-blue). */
  token: CategoryToken;
}

const ALL_TOKENS: CategoryToken[] = [
  'c-teal', 'c-green', 'c-blue', 'c-indigo', 'c-violet',
  'c-fuchsia', 'c-rose', 'c-orange', 'c-amber',
];

/** Normalize a category name for lookup: lowercase, collapse separators/whitespace. */
function norm(name: string): string {
  return name.toLowerCase().replace(/[\s/&_-]+/g, ' ').trim();
}

// Canonical map. Keys are normalized names; multiple aliases point to one meta so
// current seed names ("Auto/Transportation", "Health") and design names
// ("Auto & Transport", "Health & Wellness") resolve identically.
const RAW: Array<{ names: string[]; meta: CategoryMeta }> = [
  // ── Income ──
  { names: ['income', 'paychecks', 'take home pay', 'paycheck'], meta: { emoji: '🥇', token: 'c-green' } },
  { names: ['interest', 'interest income'], meta: { emoji: '💵', token: 'c-teal' } },
  { names: ['dividends', 'dividend income'], meta: { emoji: '📈', token: 'c-indigo' } },
  { names: ['business income'], meta: { emoji: '💼', token: 'c-amber' } },
  { names: ['rental income', 'rent income'], meta: { emoji: '🏠', token: 'c-orange' } },
  { names: ['other income'], meta: { emoji: '💵', token: 'c-blue' } },

  // ── Expenses ──
  { names: ['daily living'], meta: { emoji: '🛒', token: 'c-blue' } },
  { names: ['household'], meta: { emoji: '🏠', token: 'c-teal' } },
  { names: ['auto transportation', 'auto transport', 'auto & transport', 'transportation'], meta: { emoji: '🚗', token: 'c-orange' } },
  { names: ['utilities'], meta: { emoji: '⚡', token: 'c-amber' } },
  { names: ['health', 'health wellness', 'health & wellness'], meta: { emoji: '❤️‍🩹', token: 'c-rose' } },
  { names: ['entertainment'], meta: { emoji: '🎬', token: 'c-fuchsia' } },
  { names: ['insurance'], meta: { emoji: '🛡️', token: 'c-indigo' } },
  { names: ['business'], meta: { emoji: '💼', token: 'c-violet' } },
  { names: ['dues subscriptions', 'dues & subscriptions', 'subscriptions'], meta: { emoji: '🔁', token: 'c-violet' } },
  { names: ['clothing'], meta: { emoji: '👕', token: 'c-green' } },
  { names: ['loan', 'loans'], meta: { emoji: '🏦', token: 'c-rose' } },
  { names: ['tax not withheld', 'taxes', 'tax'], meta: { emoji: '🧾', token: 'c-amber' } },

  // ── Savings (category/group level) ──
  { names: ['savings account'], meta: { emoji: '💰', token: 'c-green' } },
  { names: ['investment account'], meta: { emoji: '📊', token: 'c-indigo' } },
  // Savings sub-category / alias hints (color falls back to the group's hue)
  { names: ['retirement'], meta: { emoji: '📈', token: 'c-indigo' } },
  { names: ['brokerage'], meta: { emoji: '📊', token: 'c-blue' } },
  { names: ['savings', 'traditional savings', 'high yield savings'], meta: { emoji: '💰', token: 'c-green' } },
  { names: ['education'], meta: { emoji: '🎓', token: 'c-teal' } },
  { names: ['emergency fund', 'emergency'], meta: { emoji: '🚨', token: 'c-rose' } },
];

const MAP = new Map<string, CategoryMeta>();
for (const { names, meta } of RAW) {
  for (const n of names) MAP.set(norm(n), meta);
}

/** Deterministic hue for names not in the canonical map (stable across sessions). */
function fallbackToken(name: string): CategoryToken {
  let h = 0;
  const s = norm(name);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ALL_TOKENS[h % ALL_TOKENS.length];
}

// ── Group lookup ────────────────────────────────────────────────────────────
// A category (leaf) inherits its group's colour, and its group's emoji when it
// has none of its own. Filled from the category + group lists (see
// setCategoryEmojiOverrides); a leaf name that exists under two groups maps to null and
// needs the optional `group` argument to resolve.
const leafToGroup = new Map<string, string | null>();
const groupColors = new Map<string, CategoryToken>();
const groupNames = new Set<string>();

function resolveGroup(name: string, group?: string | null): string | null {
  if (group) return group;
  const key = norm(name);
  // Most callers pass a group name, so a name that is a group resolves to that
  // group; a leaf that shares a group's name needs the `group` argument.
  if (groupNames.has(key)) return name;
  return leafToGroup.get(key) ?? null;
}

/**
 * Resolve emoji + hue. Emoji: the category's built-in entry, else its group's,
 * else 🏷️. Hue: always the group's (stored colour, built-in, then hash of the
 * group name). A name with no known group keeps the old name-only behaviour.
 */
export function getCategoryMeta(name: string | null | undefined, group?: string | null): CategoryMeta {
  if (!name) return { emoji: '🏷️', token: 'c-blue' };
  const own = MAP.get(norm(name));
  const groupName = resolveGroup(name, group);
  if (!groupName) return own ?? { emoji: '🏷️', token: fallbackToken(name) };
  const gKey = norm(groupName);
  const groupBuiltin = MAP.get(gKey);
  return {
    emoji: own?.emoji ?? groupBuiltin?.emoji ?? '🏷️',
    token: groupColors.get(gKey) ?? groupBuiltin?.token ?? fallbackToken(groupName),
  };
}

// ── Stored per-category emoji overrides ─────────────────────────────────────
// The Categories settings page writes a per-leaf `emoji` to the DB. That stored
// value is the source of truth wherever a category (leaf) is shown; the RAW map
// above is only the fallback/seed. Keyed by normalized `sub_name` AND
// `display_name` so callers passing either resolve. Reactive via
// useSyncExternalStore so pages re-render when the overrides load or change.
const emojiOverrides = new Map<string, string>();
let overridesVersion = 0;
const overrideListeners = new Set<() => void>();

type CategoryRow = { sub_name?: string | null; display_name?: string | null; group_name?: string | null; emoji?: string | null };
type GroupRow = { name: string; color: string | null };

export function setCategoryEmojiOverrides(cats: CategoryRow[], groups: GroupRow[] = []): void {
  emojiOverrides.clear();
  leafToGroup.clear();
  groupColors.clear();
  groupNames.clear();
  for (const g of groups) {
    const key = norm(g.name);
    groupNames.add(key);
    if (g.color && (ALL_TOKENS as string[]).includes(g.color)) groupColors.set(key, g.color as CategoryToken);
  }
  for (const c of cats) {
    if (c.sub_name && c.group_name) {
      const key = norm(c.sub_name);
      const seen = leafToGroup.get(key);
      leafToGroup.set(key, seen === undefined || seen === c.group_name ? c.group_name : null);
    }
    // The New category form saves its 🏷️ placeholder as a real value; treat it as unset.
    if (!c.emoji || c.emoji === '🏷️') continue;
    if (c.sub_name) emojiOverrides.set(norm(c.sub_name), c.emoji);
    if (c.display_name) emojiOverrides.set(norm(c.display_name), c.emoji);
  }
  overridesVersion++;
  for (const l of overrideListeners) l();
}

/** Fetch the category list and register stored emoji overrides. Safe to re-call. */
export async function loadCategoryEmojis(): Promise<void> {
  try {
    const [cats, groups] = await Promise.all([
      apiFetch<{ data: CategoryRow[] }>('/categories'),
      apiFetch<{ data: GroupRow[] }>('/categories/groups'),
    ]);
    setCategoryEmojiOverrides(cats.data, groups.data);
  } catch { /* keep RAW fallbacks in place */ }
}

/** Subscribe a component to override changes so it re-renders when they load. */
export function useCategoryEmojis(): number {
  return useSyncExternalStore(
    (cb) => { overrideListeners.add(cb); return () => { overrideListeners.delete(cb); }; },
    () => overridesVersion,
    () => overridesVersion,
  );
}

export function getCategoryEmoji(name: string | null | undefined, group?: string | null): string {
  if (name) {
    const stored = emojiOverrides.get(norm(name));
    if (stored) return stored;
  }
  return getCategoryMeta(name, group).emoji;
}

export function getCategoryToken(name: string | null | undefined, group?: string | null): CategoryToken {
  return getCategoryMeta(name, group).token;
}

/** CSS value reference, e.g. 'var(--c-blue)' — for style props and color-mix. */
export function getCategoryColorVar(name: string | null | undefined, group?: string | null): string {
  return `var(--${getCategoryMeta(name, group).token})`;
}

/**
 * Resolve a `--c-*` token (or any CSS custom property) to its current computed
 * hex, mode-aware. For consumers that need a concrete color string (e.g.
 * inline-SVG chart fills/strokes) rather than a `var()` reference. Cached per
 * (token, light/dark); the cache clears when the `.dark` class flips.
 */
let cachedDark: boolean | null = null;
const hexCache = new Map<string, string>();
function currentDark(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}
export function resolveTokenColor(token: CategoryToken | string): string {
  if (typeof document === 'undefined') return '#2563eb';
  const dark = currentDark();
  if (dark !== cachedDark) { hexCache.clear(); cachedDark = dark; }
  const varName = token.startsWith('--') ? token : `--${token}`;
  const cached = hexCache.get(varName);
  if (cached) return cached;
  const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#2563eb';
  hexCache.set(varName, val);
  return val;
}

/** Concrete hex for a category (mode-aware) — for charts and hex-only consumers. */
export function getCategoryColorHex(name: string | null | undefined, group?: string | null): string {
  return resolveTokenColor(getCategoryMeta(name, group).token);
}
