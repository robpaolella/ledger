/** Shared account/SimpleFIN helpers for the Settings → Accounts panel. */

export const ACCOUNT_TYPES = ['checking', 'savings', 'credit', 'investment', 'retirement', 'venmo', 'cash'] as const;
export const TYPE_LABEL: Record<string, string> = {
  checking: 'Checking', savings: 'Savings', credit: 'Credit card', investment: 'Investment',
  retirement: 'Retirement', venmo: 'Venmo', cash: 'Cash',
};
export const CLASSIFICATIONS = ['liquid', 'investment', 'liability'] as const;
export const CLASSIFICATION_LABEL: Record<string, string> = { liquid: 'Liquid', investment: 'Investment', liability: 'Liability' };

export function classificationForType(type: string): string {
  if (['checking', 'savings', 'venmo', 'cash'].includes(type)) return 'liquid';
  if (['investment', 'retirement'].includes(type)) return 'investment';
  if (type === 'credit') return 'liability';
  return 'liquid';
}

export function guessAccountType(sfName: string, balance: number): string {
  const lower = sfName.toLowerCase();
  if (balance < 0) return 'credit';
  if (/savings/.test(lower)) return 'savings';
  if (/checking/.test(lower)) return 'checking';
  if (/ira|roth|401k/.test(lower)) return 'retirement';
  return 'checking';
}

/** "Everyday Checking (1234)" → { name: "Everyday Checking", lastFour: "1234" } */
export function parseNameAndLastFour(sfName: string): { name: string; lastFour: string } {
  const match = sfName.match(/^(.+?)\s*\(\s*(?:[xX*•·…]*)(\d{4,5})\s*\)\s*$/);
  if (match) return { name: match[1].trim(), lastFour: match[2] };
  return { name: sfName, lastFour: '' };
}

export interface Connection {
  id: number;
  label: string;
  isShared: boolean;
  linkedAccountCount: number;
  lastSyncedAt: string | null;
}

/** One account SimpleFIN exposes, tagged with its connection + current link. */
export interface SfAccount {
  key: string;                 // `${connectionId}:${simplefinAccountId}`
  connectionId: number;
  simplefinAccountId: string;
  name: string;                // raw SimpleFIN name
  org: string;
  balance: number;
  currency: string;
  link: { id: number; accountId: number; lastSyncedAt: string | null; autoImport: number } | null;
}

export function sfKey(connectionId: number, simplefinAccountId: string): string {
  return `${connectionId}:${simplefinAccountId}`;
}

/** Design label: "{Institution} · {Name} (…{mask})" */
export function sfLabel(a: Pick<SfAccount, 'name' | 'org'>): string {
  const { name, lastFour } = parseNameAndLastFour(a.name);
  return `${a.org} · ${name}${lastFour ? ` (…${lastFour})` : ''}`;
}

export function sfMask(a: Pick<SfAccount, 'name'>): string {
  return parseNameAndLastFour(a.name).lastFour;
}
