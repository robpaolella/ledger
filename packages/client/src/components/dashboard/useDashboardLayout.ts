import { useCallback, useEffect, useState } from 'react';
import { CARDS, CARD_ORDER, type DashboardCardId } from './cardRegistry';
import { defaultLayout, parseLayout, type DashboardLayout as Layout } from './layoutModel';

export type DashboardLayout = Layout<DashboardCardId>;

const KEY = 'ledger-dashboard-layout';

function loadLayout(): DashboardLayout {
  try {
    return parseLayout(localStorage.getItem(KEY), CARDS, CARD_ORDER);
  } catch { return defaultLayout(CARDS, CARD_ORDER); } // storage unavailable
}

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);

  // Persist every committed change (drag-cancel restores then persists the
  // snapshot, so storage always matches the UI).
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(layout)); } catch { /* quota — non-fatal */ }
  }, [layout]);

  const resetLayout = useCallback(() => setLayout(defaultLayout(CARDS, CARD_ORDER)), []);

  return { layout, setLayout, resetLayout };
}
