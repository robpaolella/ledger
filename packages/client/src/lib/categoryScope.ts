/**
 * Category-drill scoping for transaction lists.
 *
 * The /transactions endpoint matches a split PARENT when any of its legs is in
 * the filtered category/group, but returns the whole parent row with its full
 * amount. In a category/group drill-down (Reports, Category detail) only the
 * matching leg(s) are attributable to that category, so a parent shown there
 * must be scoped to the summed amount + category of its matching legs — not the
 * full transaction. Non-split rows, and rows fetched with no category/group
 * filter active, pass through unchanged.
 *
 * The main Transactions page does NOT use this — it intentionally shows the full
 * split parent with its expandable legs.
 */

export interface ScopeLeg {
  categoryId: number;
  groupName: string;
  subName: string;
  displayName: string;
  type: string;
  amount: number;
}

interface ScopeCategory { id: number; groupName: string; subName: string; displayName: string; type: string }

export interface ScopeTxn {
  amount: number;
  category: ScopeCategory | null;
  splits?: ScopeLeg[] | null;
}

export interface CatScope {
  categoryIds?: number[];
  groupNames?: string[];
}

export function scopeTxnsToCategory<T extends ScopeTxn>(txns: T[], scope: CatScope): T[] {
  const idSet = new Set(scope.categoryIds ?? []);
  const groupSet = new Set(scope.groupNames ?? []);
  // No category/group dimension active → nothing to scope.
  if (idSet.size === 0 && groupSet.size === 0) return txns;

  return txns.map((t) => {
    const legs = t.splits;
    if (!legs || legs.length === 0) return t; // matched directly (non-split) — keep as-is
    const matched = legs.filter((l) => idSet.has(l.categoryId) || groupSet.has(l.groupName));
    if (matched.length === 0) return t; // safety: shouldn't happen if it's in the filtered list
    const amount = matched.reduce((s, l) => s + l.amount, 0);
    // Common case (single-category / single-group drill) → every matched leg is the
    // same category. When a multi-category filter matches legs across categories,
    // label the (summed) row by its largest matching leg rather than an arbitrary one.
    const f = matched.reduce((a, l) => (Math.abs(l.amount) > Math.abs(a.amount) ? l : a), matched[0]);
    return {
      ...t,
      amount,
      category: { id: f.categoryId, groupName: f.groupName, subName: f.subName, displayName: f.displayName, type: f.type },
      splits: null,
    } as T;
  });
}
