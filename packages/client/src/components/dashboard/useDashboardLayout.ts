import { useEffect, useState } from 'react';
import { CARDS, CARD_ORDER, type DashboardCardId } from './cardRegistry';

export interface DashboardLayout {
  version: 1;
  left: DashboardCardId[];
  right: DashboardCardId[];
}

const KEY = 'ledger-dashboard-layout';

function defaultLayout(): DashboardLayout {
  return {
    version: 1,
    left: CARD_ORDER.filter((id) => CARDS[id].defaultColumn === 'left'),
    right: CARD_ORDER.filter((id) => CARDS[id].defaultColumn === 'right'),
  };
}

/** Drop unknown ids, dedupe across columns, append any registry ids missing
 *  from both columns to their default column (handles new/removed cards). */
function reconcile(left: unknown[], right: unknown[]): DashboardLayout {
  const seen = new Set<DashboardCardId>();
  const clean = (ids: unknown[]) =>
    ids.filter((id): id is DashboardCardId => {
      if (typeof id !== 'string' || !(id in CARDS) || seen.has(id as DashboardCardId)) return false;
      seen.add(id as DashboardCardId);
      return true;
    });
  const layout: DashboardLayout = { version: 1, left: clean(left), right: clean(right) };
  for (const id of CARD_ORDER) {
    if (!seen.has(id)) layout[CARDS[id].defaultColumn].push(id);
  }
  return layout;
}

function loadLayout(): DashboardLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { version?: number; left?: unknown[]; right?: unknown[] };
      if (parsed?.version === 1 && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
        return reconcile(parsed.left, parsed.right);
      }
    }
  } catch { /* corrupt value → defaults */ }
  return defaultLayout();
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);

  // Persist every committed change (drag-cancel restores then persists the
  // snapshot, so storage always matches the UI).
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* quota — non-fatal */ }
  }, [layout]);

  return { layout, setLayout };
}
