import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { sfKey, type Connection, type SfAccount } from './simplefin';

interface RawSfAccount {
  simplefinAccountId: string;
  name: string;
  balance: number;
  currency: string;
  org: string;
  link: { id: number; accountId: number; lastSyncedAt: string | null; autoImport: number } | null;
}

/**
 * Every SimpleFIN connection this user can see, plus the accounts each one
 * exposes (fetched from the SimpleFIN bridge, so a connection can fail on its
 * own without hiding the others).
 *
 * Listing accounts contacts SimpleFIN once per connection, so callers that only
 * sometimes show them pass `loadAccounts: false` until they do; connections
 * (read from Ledger's own database) always load. Default is eager.
 */
export function useSimpleFin({ loadAccounts = true }: { loadAccounts?: boolean } = {}) {
  const loadAccountsRef = useRef(loadAccounts);
  loadAccountsRef.current = loadAccounts;
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sfAccounts, setSfAccounts] = useState<SfAccount[]>([]);
  const [failures, setFailures] = useState<{ connectionId: number; label: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  /** `quiet` refreshes in place: no spinner, and a failed refresh keeps what's on screen. */
  const reload = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) setLoading(true);
    const wantAccounts = loadAccountsRef.current;
    // Set before the connections request so the panel never flashes "no accounts" in between.
    if (wantAccounts) setAccountsLoading(true);
    let conns: Connection[] = [];
    try {
      const res = await apiFetch<{ data: Connection[] }>('/simplefin/connections');
      conns = res.data;
      setConnections(conns);
      setLoadFailed(false);
    } catch {
      if (wantAccounts) setAccountsLoading(false);
      if (quiet) return;
      setConnections([]);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
    if (!wantAccounts) return;
    if (conns.length === 0) { setSfAccounts([]); setFailures([]); setAccountsLoading(false); return; }
    const results = await Promise.all(conns.map(async (c) => {
      try {
        const res = await apiFetch<{ data: RawSfAccount[] }>(`/simplefin/connections/${c.id}/accounts`, { method: 'POST' });
        return { ok: true as const, c, accounts: res.data };
      } catch (err) {
        return { ok: false as const, c, error: err instanceof Error ? err.message : 'Failed to reach SimpleFIN' };
      }
    }));
    const all: SfAccount[] = [];
    const fails: { connectionId: number; label: string; error: string }[] = [];
    for (const r of results) {
      if (r.ok) {
        for (const a of r.accounts) all.push({ key: sfKey(r.c.id, a.simplefinAccountId), connectionId: r.c.id, simplefinAccountId: a.simplefinAccountId, name: a.name, org: a.org, balance: a.balance, currency: a.currency, link: a.link });
      } else {
        fails.push({ connectionId: r.c.id, label: r.c.label, error: r.error });
      }
    }
    all.sort((a, b) => a.org.localeCompare(b.org) || a.name.localeCompare(b.name));
    setSfAccounts(all);
    setFailures(fails);
    setAccountsLoading(false);
  }, []);

  // Load on mount; when accounts become wanted later, refresh in place to fetch them.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; reload(); return; }
    if (loadAccounts) reload({ quiet: true });
  }, [reload, loadAccounts]);

  return { connections, sfAccounts, failures, loading, accountsLoading, loadFailed, reload };
}
