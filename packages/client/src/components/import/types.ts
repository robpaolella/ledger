/** Shared types for the redesigned Import flow. */

export interface ImpOwner { id: number; displayName: string }

/** A bank-syncable account: a Ledger account linked to a SimpleFIN account. */
export interface SyncAccount {
  id: number;                 // ledger account id
  name: string;               // ledger account name
  lastFour: string | null;
  bucket: 'liquid' | 'investment' | 'liability';
  owners: ImpOwner[];
  isShared: boolean;
  logoSrc?: string;           // institution/account logo (undefined → monogram)
  color: string;              // brand/monogram color (CSS value)
  institutionName: string;    // display institution
  sfinName: string;           // SimpleFIN account name
  syncedAt: string | null;    // last synced
}

export const BUCKETS: { key: SyncAccount['bucket']; label: string; color: string; paths: string[] }[] = [
  { key: 'liquid', label: 'Liquid', color: 'var(--c-blue)', paths: ['M12 3s6.5 6.8 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 9.8 12 3 12 3z'] },
  { key: 'investment', label: 'Investments', color: 'var(--c-amber)', paths: ['M3 17l6-6 4 4 8-8', 'M17 7h4v4'] },
  { key: 'liability', label: 'Liabilities', color: 'var(--c-rose)', paths: ['M2 6.5h20v11H2z', 'M2 10.5h20', 'M6 14.5h5'] },
];

/** A candidate transaction from SimpleFIN sync (Bank Sync review). */
export interface ImpSyncRow {
  simplefinId: string;
  accountId: number;
  accountName: string;
  date: string;              // 'YYYY-MM-DD'
  description: string;       // payee (editable)
  rawDescription: string;    // original statement text
  amount: number;            // ledger sign (money-out positive)
  confidence: number;        // 0–1
  categoryId: number | null; // user override / suggestion
  source?: string | null;    // suggestion origin (rule/merchant-history/…/llm); null = user-picked
  duplicateStatus: 'exact' | 'possible' | 'none';
  isLikelyTransfer: boolean;
  isDismissedTransfer: boolean;
}

/** A candidate transaction from a CSV import (CSV review). */
export interface ImpCsvRow {
  date: string;              // 'YYYY-MM-DD'
  description: string;       // editable
  note?: string;
  amount: number;            // ledger sign (money-out positive)
  confidence: number;        // 0–1
  categoryId: number | null;
  source?: string | null;    // suggestion origin; null = user-picked
  duplicateStatus: 'exact' | 'possible' | 'none';
  isLikelyTransfer: boolean;
  isDismissedTransfer: boolean;
}

/** Lightweight account metadata for review rows (keyed by ledger account id). */
export interface AccountMeta {
  name: string;
  lastFour: string | null;
  logoSrc?: string;
  color: string;
}

const OWNER_PALETTE = ['var(--own-robert)', 'var(--own-kathleen)', 'var(--c-teal)', 'var(--c-violet)', 'var(--c-orange)', 'var(--c-green)'];
export function ownerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length];
}
