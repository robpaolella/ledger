import { Router, Request, Response } from 'express';
import { db, sqlite } from '../db/index.js';
import { balanceSnapshots, accounts, assets } from '../db/schema.js';
import { eq, asc, desc } from 'drizzle-orm';
import { calculateCurrentValue } from '../utils/depreciation.js';

const router = Router();

// GET /api/networth/summary
router.get('/summary', (_req: Request, res: Response) => {
  try {
    // Get latest balance per active account
    const balances = db.select({
      account_id: balanceSnapshots.account_id,
      date: balanceSnapshots.date,
      balance: balanceSnapshots.balance,
      name: accounts.name,
      last_four: accounts.last_four,
      type: accounts.type,
      institution: accounts.institution,
      institution_id: accounts.institution_id,
      avatar_url: accounts.avatar_url,
      owner: accounts.owner,
      classification: accounts.classification,
    }).from(balanceSnapshots)
      .innerJoin(accounts, eq(balanceSnapshots.account_id, accounts.id))
      .where(eq(accounts.is_active, 1))
      .orderBy(desc(balanceSnapshots.date), desc(balanceSnapshots.id))
      .all();

    const seen = new Set<number>();
    type AcctRow = {
      accountId: number; name: string; lastFour: string | null; type: string;
      institution: string | null; institutionId: number | null; avatarUrl: string | null;
      owner: string; classification: string; balance: number; date: string;
    };
    const accountList: AcctRow[] = [];
    for (const b of balances) {
      if (!seen.has(b.account_id)) {
        seen.add(b.account_id);
        accountList.push({
          accountId: b.account_id,
          name: b.name,
          lastFour: b.last_four,
          type: b.type,
          institution: b.institution,
          institutionId: b.institution_id ?? null,
          avatarUrl: b.avatar_url ?? null,
          owner: b.owner,
          classification: b.classification,
          balance: b.balance,
          date: b.date,
        });
      }
    }

    // Also include accounts with no balance snapshots (balance = 0)
    const allAccounts = db.select().from(accounts).where(eq(accounts.is_active, 1)).all();
    for (const a of allAccounts) {
      if (!seen.has(a.id)) {
        accountList.push({
          accountId: a.id,
          name: a.name,
          lastFour: a.last_four,
          type: a.type,
          institution: a.institution,
          institutionId: a.institution_id ?? null,
          avatarUrl: a.avatar_url ?? null,
          owner: a.owner,
          classification: a.classification,
          balance: 0,
          date: '',
        });
      }
    }

    let liquidTotal = 0;
    let investmentTotal = 0;
    let liabilityTotal = 0;
    for (const a of accountList) {
      if (a.classification === 'liquid') liquidTotal += a.balance;
      else if (a.classification === 'investment') investmentTotal += a.balance;
      // Stored sign: owed is negative, a credit is positive. liabilityTotal is
      // the amount owed, so a card in credit reduces it (and raises net worth).
      else if (a.classification === 'liability') liabilityTotal -= a.balance;
    }

    // Assets
    const allAssets = db.select().from(assets).all();
    const assetList = allAssets.map((a) => ({
      id: a.id,
      name: a.name,
      purchaseDate: a.purchase_date,
      cost: a.cost,
      lifespanYears: a.lifespan_years,
      salvageValue: a.salvage_value,
      depreciationMethod: a.depreciation_method,
      decliningRate: a.declining_rate,
      currentValue: calculateCurrentValue({
        cost: a.cost, salvageValue: a.salvage_value, lifespanYears: a.lifespan_years,
        purchaseDate: a.purchase_date, depreciationMethod: a.depreciation_method as 'straight_line' | 'declining_balance',
        decliningRate: a.declining_rate,
        // Value at today's date (same basis as /history's last point) so the
        // headline reconciles exactly with the chart's ending value.
        asOf: fmtDate(new Date()),
      }),
    }));

    const physicalAssetTotal = assetList.reduce((s, a) => s + a.currentValue, 0);
    const netWorth = liquidTotal + investmentTotal + physicalAssetTotal - liabilityTotal;

    // Enrich accounts with owners (junction) + last-synced timestamp (SimpleFIN links)
    const acctIds = accountList.map((a) => a.accountId);
    const ownerRows = acctIds.length > 0 ? (sqlite.prepare(`
      SELECT ao.account_id, u.id as user_id, u.display_name
      FROM account_owners ao
      JOIN users u ON ao.user_id = u.id
      WHERE ao.account_id IN (${acctIds.map(() => '?').join(',')})
      ORDER BY u.display_name
    `).all(...acctIds) as { account_id: number; user_id: number; display_name: string }[]) : [];

    const ownerMap = new Map<number, { id: number; displayName: string }[]>();
    for (const o of ownerRows) {
      if (!ownerMap.has(o.account_id)) ownerMap.set(o.account_id, []);
      ownerMap.get(o.account_id)!.push({ id: o.user_id, displayName: o.display_name });
    }

    const syncRows = sqlite.prepare(
      "SELECT account_id, MAX(last_synced_at) as last_synced_at FROM simplefin_links WHERE last_synced_at IS NOT NULL GROUP BY account_id"
    ).all() as { account_id: number; last_synced_at: string }[];
    const syncMap = new Map<number, string>(syncRows.map((r) => [r.account_id, r.last_synced_at]));

    // Resolve linked-institution logo + color so the client can render the
    // account avatar (per-account override wins over the institution logo).
    const instIds = [...new Set(accountList.map((a) => a.institutionId).filter((v): v is number => v != null))];
    const instMap = new Map<number, { name: string; logo_url: string | null; color: string | null }>();
    if (instIds.length > 0) {
      const instRows = sqlite.prepare(
        `SELECT id, name, logo_url, color FROM financial_institutions WHERE id IN (${instIds.map(() => '?').join(',')})`
      ).all(...instIds) as { id: number; name: string; logo_url: string | null; color: string | null }[];
      for (const i of instRows) instMap.set(i.id, { name: i.name, logo_url: i.logo_url, color: i.color });
    }

    const enrichedAccounts = accountList.map((a) => {
      const owners = ownerMap.get(a.accountId) || [];
      const inst = a.institutionId != null ? instMap.get(a.institutionId) : undefined;
      return {
        ...a,
        owners,
        isShared: owners.length > 1,
        lastUpdated: syncMap.get(a.accountId) ?? null,
        // Prefer the linked institution's name over the legacy free-text field.
        institution: inst?.name ?? a.institution,
        logoUrl: a.avatarUrl || inst?.logo_url || null,
        institutionColor: inst?.color ?? null,
      };
    });

    res.json({
      data: {
        liquidTotal,
        investmentTotal,
        liabilityTotal,
        physicalAssetTotal,
        netWorth,
        accounts: enrichedAccounts,
        assets: assetList,
      },
    });
  } catch (err) {
    console.error('GET /networth/summary error:', err);
    res.status(500).json({ error: 'Failed to fetch net worth summary' });
  }
});

const RANGE_DAYS: Record<string, number | null> = {
  '1m': 30, '3m': 90, '6m': 180, '1y': 365, 'all': null,
};

const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

// GET /api/networth/history?range=1m|3m|6m|1y|all
// Net worth over time: carry-forward the latest balance per account for each
// sampled date, plus per-date physical-asset depreciation. Snapshots are sparse
// (recorded only on sync/manual save), so we never assume a value on every date.
router.get('/history', (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '1m';
    const rangeDays = range in RANGE_DAYS ? RANGE_DAYS[range] : 30;
    // Optional account filter — keeps the chart/change consistent with the
    // page's filtered headline/summary. Physical assets are never filtered.
    // `!== undefined` (not truthiness) so an explicit empty `accountIds=` means
    // "no accounts selected" (physical-only) rather than "no filter".
    const idsParam = req.query.accountIds as string | undefined;
    const filterIds = idsParam !== undefined ? new Set(idsParam.split(',').map(Number).filter((n) => !isNaN(n))) : null;

    const activeAccounts = db.select({ id: accounts.id, classification: accounts.classification })
      .from(accounts).where(eq(accounts.is_active, 1)).all()
      .filter((a) => !filterIds || filterIds.has(a.id));
    const classOf = new Map<number, string>(activeAccounts.map((a) => [a.id, a.classification]));

    // All snapshots for active accounts, oldest → newest, grouped per account.
    const snaps = db.select({
      account_id: balanceSnapshots.account_id,
      date: balanceSnapshots.date,
      balance: balanceSnapshots.balance,
    }).from(balanceSnapshots)
      .innerJoin(accounts, eq(balanceSnapshots.account_id, accounts.id))
      .where(eq(accounts.is_active, 1))
      .orderBy(asc(balanceSnapshots.date), asc(balanceSnapshots.id))
      .all();

    const perAccount = new Map<number, { date: string; balance: number }[]>();
    for (const s of snaps) {
      if (filterIds && !filterIds.has(s.account_id)) continue;
      if (!perAccount.has(s.account_id)) perAccount.set(s.account_id, []);
      perAccount.get(s.account_id)!.push({ date: s.date, balance: s.balance });
    }

    const assetRows = db.select().from(assets).all();

    // Date window. 'YYYY-MM-DD' strings compare chronologically, so string
    // comparison is safe for carry-forward.
    const today = new Date();
    const end = fmtDate(today);
    const endMs = new Date(end + 'T00:00:00Z').getTime();
    const earliestSnapMs = snaps.length > 0 ? new Date(snaps[0].date + 'T00:00:00Z').getTime() : null;
    let startMs: number;
    if (rangeDays == null) {
      // 'all' — from the first day we have any balance data.
      startMs = earliestSnapMs ?? endMs - 30 * 86400000;
    } else {
      // Don't plot net worth for dates before we have any balance data (would
      // otherwise show a misleading physical-assets-only floor).
      startMs = endMs - rangeDays * 86400000;
      if (earliestSnapMs != null) startMs = Math.max(startMs, earliestSnapMs);
    }

    // Sample up to ~90 evenly-spaced points across the window. Step by real ms
    // and bound by endMs so a zero/short span never overshoots into the future.
    const spanDays = Math.max(0, Math.round((endMs - startMs) / 86400000));
    const step = Math.max(1, Math.ceil((spanDays || 1) / 90));
    const targets: string[] = [];
    for (let ms = startMs; ms <= endMs; ms += step * 86400000) targets.push(fmtDate(new Date(ms)));
    if (targets.length === 0 || targets[targets.length - 1] !== end) targets.push(end);

    // Carry-forward pointer per account as we walk targets forward.
    const ptr = new Map<number, number>();
    for (const id of perAccount.keys()) ptr.set(id, -1);

    const points = targets.map((target) => {
      let liquid = 0, investment = 0, liability = 0;
      for (const [id, list] of perAccount) {
        let i = ptr.get(id)!;
        while (i + 1 < list.length && list[i + 1].date <= target) i++;
        ptr.set(id, i);
        if (i < 0) continue; // no snapshot on/before this date yet
        const bal = list[i].balance;
        const cls = classOf.get(id);
        if (cls === 'liquid') liquid += bal;
        else if (cls === 'investment') investment += bal;
        else if (cls === 'liability') liability -= bal; // amount owed; a credit reduces it
      }
      let physical = 0;
      for (const a of assetRows) {
        if (a.purchase_date && a.purchase_date > target) continue; // not yet owned
        physical += calculateCurrentValue({
          cost: a.cost, salvageValue: a.salvage_value, lifespanYears: a.lifespan_years,
          purchaseDate: a.purchase_date, depreciationMethod: a.depreciation_method as 'straight_line' | 'declining_balance',
          decliningRate: a.declining_rate, asOf: target,
        });
      }
      const assetsTotal = liquid + investment + physical;
      return { date: target, netWorth: assetsTotal - liability, liquid, investment, liability, physical, assets: assetsTotal };
    });

    res.json({ data: { range, points } });
  } catch (err) {
    console.error('GET /networth/history error:', err);
    res.status(500).json({ error: 'Failed to fetch net worth history' });
  }
});

export default router;
