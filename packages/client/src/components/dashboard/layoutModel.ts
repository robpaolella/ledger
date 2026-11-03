/** Pure dashboard-layout logic, kept free of React and the card components so it can be unit-tested. */

export interface DashboardLayout<Id extends string = string> {
  version: 1;
  left: Id[];
  right: Id[];
}

export type CardDefaults<Id extends string> = Record<Id, { defaultColumn: 'left' | 'right' }>;

export function defaultLayout<Id extends string>(cards: CardDefaults<Id>, order: Id[]): DashboardLayout<Id> {
  return {
    version: 1,
    left: order.filter((id) => cards[id].defaultColumn === 'left'),
    right: order.filter((id) => cards[id].defaultColumn === 'right'),
  };
}

/** Drop unknown ids, dedupe across columns, append any registry ids missing
 *  from both columns to their default column (handles new/removed cards). */
export function reconcile<Id extends string>(
  left: unknown[], right: unknown[], cards: CardDefaults<Id>, order: Id[],
): DashboardLayout<Id> {
  const seen = new Set<Id>();
  const clean = (ids: unknown[]) =>
    ids.filter((id): id is Id => {
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(cards, id) || seen.has(id as Id)) return false;
      seen.add(id as Id);
      return true;
    });
  const layout: DashboardLayout<Id> = { version: 1, left: clean(left), right: clean(right) };
  for (const id of order) {
    if (!seen.has(id)) layout[cards[id].defaultColumn].push(id);
  }
  return layout;
}

/** Parse a saved value; anything corrupt or unrecognised falls back to the default layout. */
export function parseLayout<Id extends string>(raw: string | null, cards: CardDefaults<Id>, order: Id[]): DashboardLayout<Id> {
  try {
    if (raw) {
      const parsed = JSON.parse(raw) as { version?: number; left?: unknown[]; right?: unknown[] };
      if (parsed?.version === 1 && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
        return reconcile(parsed.left, parsed.right, cards, order);
      }
    }
  } catch { /* corrupt value → defaults */ }
  return defaultLayout(cards, order);
}
