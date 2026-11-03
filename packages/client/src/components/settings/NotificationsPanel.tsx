import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Switch } from '../primitives';
import Spinner from '../Spinner';
import { Card, LoadError, PanelHeader, Pill } from './ui';

/** Settings → Notifications: each person's own alert choices. */
export default function NotificationsPanel() {
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const [overBudget, setOverBudget] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await apiFetch<{ data: { overBudgetAlerts: boolean } }>('/notifications/preferences');
      setOverBudget(res.data.overBudgetAlerts);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (next: boolean) => {
    setOverBudget(next);
    try {
      await apiFetch('/notifications/preferences', { method: 'PUT', body: JSON.stringify({ overBudgetAlerts: next }) });
      addToast(next ? 'Over-budget alerts on' : 'Over-budget alerts off');
    } catch {
      setOverBudget(!next);
      addToast('Couldn’t save that change. Try again.', 'error');
    }
  };

  // Admins pass hasPermission for everything, so this covers owner/admin too.
  const seesBankSync = hasPermission('simplefin.manage') || hasPermission('import.bank_sync');

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Notifications" description="Which alerts Ledger shows you. These choices are yours alone; other people set their own." />
      {loadFailed ? <LoadError onRetry={load} /> : overBudget === null ? <Card><Spinner /></Card> : (
        <Card>
          <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-4">
            <div className="min-w-0">
              <div className="text-[14.5px] font-semibold text-content">Over-budget alerts</div>
              <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug">Tell me when a category goes over its budget for the month.</div>
            </div>
            <Switch checked={overBudget} onChange={toggle} title="Over-budget alerts" />
          </div>
          {seesBankSync && (
            <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-4 border-t border-line">
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold text-content">Bank sync problems</div>
                <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug">You’ll always hear when bank sync keeps failing or needs reconnecting, so it never stops quietly.</div>
              </div>
              <Pill color="var(--text-3)" className="shrink-0">Always on</Pill>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
