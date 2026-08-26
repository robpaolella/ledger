import type { MouseEvent } from 'react';

export type AccountClassification = 'liquid' | 'investment' | 'liability';

/* ------ AccountBadge ------ */
export function AccountBadge({ name }: { name: string }) {
  return (
    <span className="inline-block text-[11px] font-mono bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] px-2 py-0.5 rounded-md">
      {name}
    </span>
  );
}

/* ------ CategoryBadge (tinted sub-category pill) ------ */
export function CategoryBadge({ name, color, emoji }: { name: string; color?: string; emoji?: string }) {
  if (color) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-lg"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
          color: color,
        }}
      >
        {emoji && <span className="text-[11px] leading-none">{emoji}</span>}
        {name}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-lg bg-surface-2 border border-line text-content-2">
      {emoji && <span className="text-[11px] leading-none">{emoji}</span>}
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
  const cls = 'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md';
  const style = { backgroundColor: 'color-mix(in srgb, var(--warning) 18%, transparent)', color: 'var(--warning)' };
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
// Stable mapping: sort all known user IDs, first gets slot 1, second gets slot 2
const ownerSlotCache = new Map<number, 1 | 2>();
let knownIds: number[] = [];

export function initOwnerSlots(userIds: number[]) {
  knownIds = [...userIds].sort((a, b) => a - b);
  ownerSlotCache.clear();
  knownIds.forEach((id, i) => ownerSlotCache.set(id, (i % 2 === 0 ? 1 : 2) as 1 | 2));
}

function getOwnerSlot(userId: number): 1 | 2 {
  if (ownerSlotCache.has(userId)) return ownerSlotCache.get(userId)!;
  // Fallback for unknown users
  return userId % 2 === 0 ? 1 : 2;
}

const OWNER_CLASSES: Record<1 | 2, string> = {
  1: 'bg-[var(--badge-owner-1-bg)] text-[var(--badge-owner-1-text)]',
  2: 'bg-[var(--badge-owner-2-bg)] text-[var(--badge-owner-2-text)]',
};

export function OwnerBadge({ user }: { user: { id: number; displayName: string } }) {
  const slot = getOwnerSlot(user.id);
  return (
    <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-md ${OWNER_CLASSES[slot]}`}>
      {user.displayName}
    </span>
  );
}

/* ------ SharedBadge ------ */
export function SharedBadge() {
  return (
    <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--badge-shared-bg)] text-[var(--badge-shared-text)]">
      Shared
    </span>
  );
}

/* ------ ClassificationBadge ------ */
const CLASSIFICATION_CLASSES: Record<AccountClassification, string> = {
  liquid: 'bg-[var(--badge-liquid-bg)] text-[var(--badge-liquid-text)]',
  investment: 'bg-[var(--badge-investment-bg)] text-[var(--badge-investment-text)]',
  liability: 'bg-[var(--badge-liability-bg)] text-[var(--badge-liability-text)]',
};

export function ClassificationBadge({ classification }: { classification: AccountClassification }) {
  return (
    <span className={`inline-block text-[10px] font-medium capitalize px-2 py-0.5 rounded-md ${CLASSIFICATION_CLASSES[classification]}`}>
      {classification}
    </span>
  );
}

/* ------ SplitBadge ------ */
export function SplitBadge({ colors, count, compact = false }: {
  colors: string[];
  count: number;
  compact?: boolean;
}) {
  const dotSize = compact ? 8 : 10;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex" style={{ gap: 0 }}>
        {colors.map((color, i) => (
          <span key={i} style={{
            width: dotSize, height: dotSize, borderRadius: '50%',
            background: color,
            border: '1.5px solid var(--bg-card)',
            marginLeft: i > 0 ? -3 : 0,
            zIndex: colors.length - i,
            display: 'inline-block',
            flexShrink: 0,
          }} />
        ))}
      </span>
      <span className="text-[10px] font-semibold text-[var(--text-secondary)] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] whitespace-nowrap">
        Split ({count})
      </span>
    </span>
  );
}

/* ------ ConnectedBadge ------ */
export function ConnectedBadge() {
  return (
    <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md bg-[var(--badge-connected-bg)] text-[var(--badge-connected-text)]">
      Connected
    </span>
  );
}

/* ------ ReimbursementBadge ------ */
export function ReimbursementBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--bg-inline-info)] text-[var(--text-inline-info)] border border-[var(--bg-inline-info-border)]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      Reimbursement
    </span>
  );
}
