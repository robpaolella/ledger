import type { MouseEvent } from 'react';

export type AccountClassification = 'liquid' | 'investment' | 'liability';

/* Tinted tag recipe (design system "owner tag"): h-5 px-2 rounded-md 11px/600,
 * fill = color-mix 16%, text = solid token. */
const TAG = 'inline-flex items-center h-5 px-2 rounded-md text-[11px] font-semibold whitespace-nowrap';
const tint = (color: string) => ({ background: `color-mix(in srgb, ${color} 16%, transparent)`, color });

/* ------ CategoryBadge (sub-category pill: h-[26px] px-3 rounded-lg 12px/600) ------ */
export function CategoryBadge({ name, color, emoji }: { name: string; color?: string; emoji?: string }) {
  const base = 'inline-flex items-center gap-1.5 h-[26px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap';
  if (color) {
    return (
      <span className={base} style={tint(color)}>
        {emoji && <span className="text-[12px] leading-none">{emoji}</span>}
        {name}
      </span>
    );
  }
  return (
    <span className={`${base} bg-surface-2 border border-line text-content-2`}>
      {emoji && <span className="text-[12px] leading-none">{emoji}</span>}
      {name}
    </span>
  );
}

/* ------ NeedsReviewBadge (low-confidence / uncategorized auto-import) ------ */
export const NEEDS_REVIEW_HINT =
  'Auto-categorized with low confidence or left uncategorized — review the category';

/** With `onClick` the badge becomes a button (a quick-action popover trigger in
 *  the transaction list); without it, a plain non-interactive pill. */
export function NeedsReviewBadge({ onClick }: { onClick?: (e: MouseEvent) => void } = {}) {
  const cls = `${TAG} gap-1`;
  const style = tint('var(--warning)');
  const icon = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
  );
  if (onClick) {
    return (
      <button
        type="button"
        // The badge sits inside a click-to-edit cell — don't open that editor too.
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        className={`${cls} border-none cursor-pointer hover:brightness-95`}
        style={style}
        title="Review this transaction"
      >
        {icon}
        Review
      </button>
    );
  }
  return (
    <span className={cls} style={style} title={NEEDS_REVIEW_HINT}>
      {icon}
      Review
    </span>
  );
}

/* ------ OwnerBadge ------ */
// Stable mapping: sort all known user IDs; the nth gets --owner-n, wrapping after six.
const OWNER_SLOTS = 6;
const ownerSlotCache = new Map<number, number>();

export function initOwnerSlots(userIds: number[]) {
  ownerSlotCache.clear();
  [...userIds].sort((a, b) => a - b).forEach((id, i) => ownerSlotCache.set(id, (i % OWNER_SLOTS) + 1));
}

/** The one person colour (design tokens `--owner-1`..`--owner-6`), keyed on user id, never a name. */
export function ownerColor(userId: number): string {
  const slot = ownerSlotCache.get(userId) ?? (Math.abs(userId) % OWNER_SLOTS) + 1; // fallback for unknown users
  return `var(--owner-${slot})`;
}

export function OwnerBadge({ user }: { user: { id: number; displayName: string } }) {
  return <span className={TAG} style={tint(ownerColor(user.id))}>{user.displayName}</span>;
}

/* ------ SharedBadge ------ */
export function SharedBadge() {
  return <span className={TAG} style={tint('var(--owner-shared)')}>Shared</span>;
}

/* ------ ClassificationBadge ------ */
const CLASSIFICATION_COLOR: Record<AccountClassification, string> = {
  liquid: 'var(--positive)',
  investment: 'var(--c-violet)',
  liability: 'var(--negative)',
};

export function ClassificationBadge({ classification }: { classification: AccountClassification }) {
  return <span className={`${TAG} capitalize`} style={tint(CLASSIFICATION_COLOR[classification])}>{classification}</span>;
}

/* ------ SplitBadge ------ */
export function SplitBadge({ colors, count, compact = false }: {
  colors: string[];
  count: number;
  compact?: boolean;
}) {
  const dotSize = compact ? 8 : 10;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex">
        {colors.map((color, i) => (
          <span key={i} style={{
            width: dotSize, height: dotSize, borderRadius: '50%',
            background: color,
            border: '1.5px solid var(--surface)',
            marginLeft: i > 0 ? -3 : 0,
            zIndex: colors.length - i,
            display: 'inline-block',
            flexShrink: 0,
          }} />
        ))}
      </span>
      <span className={`${TAG} bg-surface-2 text-content-2`}>Split ({count})</span>
    </span>
  );
}

/* ------ ConnectedBadge (status pill with a dot) ------ */
export function ConnectedBadge({ label = 'Connected' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 h-[22px] px-[9px] rounded-full text-[12px] font-bold whitespace-nowrap" style={tint('var(--positive)')}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--positive)' }} />
      {label}
    </span>
  );
}

/* ------ ReimbursementBadge ------ */
export function ReimbursementBadge() {
  return (
    <span className={`${TAG} gap-1`} style={tint('var(--primary)')}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      Reimbursement
    </span>
  );
}
