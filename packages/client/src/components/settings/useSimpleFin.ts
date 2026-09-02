import { useCallback, useEffect, useState } from 'react';
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
 */
export function useSimpleFin() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sfAccounts, setSfAccounts] = useState<SfAccount[]>([]);
  const [failures, setFailures] = useState<{ connectionId: number; label: string; error: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    let conns: Connection[] = [];
    try {
      const res = await apiFetch<{ data: Connection[] }>('/simplefin/connections');
      conns = res.data;
      setConnections(conns);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
    if (conns.length === 0) { setSfAccounts([]); setFailures([]); return; }
    setAccountsLoading(true);
    const results = await Promise.all(conns.map(async (c) => {
      try {
        const res = await apiFetch<{ data: RawSfAccount[] }>(`/simplefin/connections/${c.id}/accounts`);
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

  useEffect(() => { reload(); }, [reload]);

  return { connections, sfAccounts, failures, loading, accountsLoading, reload };
}
