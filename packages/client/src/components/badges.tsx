export type AccountClassification = 'liquid' | 'investment' | 'liability';

/* ------ AccountBadge ------ */
export function AccountBadge({ name }: { name: string }) {
  return (
    <span className="inline-block text-[11px] font-mono bg-[var(--badge-account-bg)] text-[var(--badge-account-text)] px-2 py-0.5 rounded-md">
      {name}
    </span>
  );
}

/* ------ CategoryBadge ------ */
export function CategoryBadge({ name, color }: { name: string; color?: string }) {
  if (color) {
    return (
      <span
        className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-md"
        style={{
          backgroundColor: `${color}18`,
          color: color,
        }}
      >
        {name}
      </span>
    );
  }
  return (
    <span className="inline-block text-[11px] bg-[var(--badge-category-bg)] text-[var(--badge-category-text)] px-2 py-0.5 rounded-md">
      {name}
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
