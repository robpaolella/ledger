// SimpleFIN API response types
export interface SimpleFINOrg {
  domain: string;
  name: string;
  url: string;
  id: string;
}

export interface SimpleFINTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  payee: string;
  memo: string;
  transacted_at: number;
}

export interface SimpleFINHolding {
  id: string;
  created: number;
  currency: string;
  cost_basis: string;
  description: string;
  market_value: string;
  purchase_price: string;
  shares: string;
  symbol: string;
}

export interface SimpleFINAccount {
  id: string;
  name: string;
  currency: string;
  balance: string;
  'available-balance': string;
  'balance-date': number;
  transactions: SimpleFINTransaction[];
  holdings: SimpleFINHolding[];
  org: SimpleFINOrg;
}

export interface SimpleFINResponse {
  errors: string[];
  accounts: SimpleFINAccount[];
}

const MAX_DAYS_PER_REQUEST = 60;

/** Shown to the visitor when the bank's server can't be reached at all. */
export const BANK_UNREACHABLE_MESSAGE = "Couldn't reach your bank. Try again in a moment.";

/** fetch() that turns a network failure ("fetch failed") into plain wording. */
async function fetchBank(url: string, init?: RequestInit): Promise<Response> {
  new URL(url); // a malformed address keeps its own error; only a failed request is "unreachable"
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(BANK_UNREACHABLE_MESSAGE);
  }
}

/**
 * Claim a SimpleFIN Access URL from a setup token.
 * One-time operation — the setup token is invalidated after use.
 */
export async function claimAccessUrl(setupToken: string): Promise<string> {
  const claimUrl = Buffer.from(setupToken.trim(), 'base64').toString('utf-8');

  const response = await fetchBank(claimUrl, { method: 'POST' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to claim SimpleFIN access URL: ${response.status} ${text}`);
  }

  const accessUrl = await response.text();
  if (!accessUrl || !accessUrl.startsWith('http')) {
    throw new Error('Invalid access URL received from SimpleFIN');
  }

  return accessUrl.trim();
}

/**
 * Fetch accounts (with transactions and holdings) from SimpleFIN.
 * Splits requests that exceed 60 days into multiple calls and merges results.
 */
export async function fetchAccounts(
  accessUrl: string,
  startDate?: number,
  endDate?: number
): Promise<SimpleFINResponse> {
  // If range exceeds 60 days, split into chunks
  if (startDate && endDate) {
    const rangeDays = (endDate - startDate) / 86400;
    if (rangeDays > MAX_DAYS_PER_REQUEST) {
      return fetchAccountsChunked(accessUrl, startDate, endDate);
    }
  }

  return fetchAccountsSingle(accessUrl, startDate, endDate);
}

async function fetchAccountsSingle(
  accessUrl: string,
  startDate?: number,
  endDate?: number
): Promise<SimpleFINResponse> {
  const url = new URL(`${accessUrl}/accounts`);
  if (startDate) url.searchParams.set('start-date', String(startDate));
  if (endDate) url.searchParams.set('end-date', String(endDate));

  // Extract credentials from URL — fetch() rejects URLs with embedded credentials
  const headers: Record<string, string> = {};
  if (url.username) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${url.username}:${url.password}`).toString('base64');
    url.username = '';
    url.password = '';
  }

  const response = await fetchBank(url.toString(), { headers });

  if (response.status === 403) {
    throw new Error('SimpleFIN authentication failed. You may need to reauthenticate.');
  }
  if (response.status === 429) {
    throw new Error('SimpleFIN rate limit exceeded. Try again later (limit: ~24 requests/day).');
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SimpleFIN API error: ${response.status} ${text}`);
  }

  const data = (await response.json()) as SimpleFINResponse;
  return data;
}

async function fetchAccountsChunked(
  accessUrl: string,
  startDate: number,
  endDate: number
): Promise<SimpleFINResponse> {
  const chunks: { start: number; end: number }[] = [];
  let chunkStart = startDate;

  while (chunkStart < endDate) {
    const chunkEnd = Math.min(chunkStart + MAX_DAYS_PER_REQUEST * 86400, endDate);
    chunks.push({ start: chunkStart, end: chunkEnd });
    chunkStart = chunkEnd;
  }

  const results: SimpleFINResponse[] = [];
  for (const chunk of chunks) {
    const result = await fetchAccountsSingle(accessUrl, chunk.start, chunk.end);
    results.push(result);
  }

  // Merge: combine accounts, deduplicate transactions by ID
  return mergeResponses(results);
}

function mergeResponses(responses: SimpleFINResponse[]): SimpleFINResponse {
  if (responses.length === 0) return { errors: [], accounts: [] };
  if (responses.length === 1) return responses[0];

  const errors: string[] = [];
  const accountMap = new Map<string, SimpleFINAccount>();

  for (const resp of responses) {
    errors.push(...resp.errors);
    for (const acct of resp.accounts) {
      const existing = accountMap.get(acct.id);
      if (!existing) {
        accountMap.set(acct.id, { ...acct, transactions: [...acct.transactions] });
      } else {
        // Merge transactions, deduplicate by ID
        const txnIds = new Set(existing.transactions.map((t) => t.id));
        for (const txn of acct.transactions) {
          if (!txnIds.has(txn.id)) {
            existing.transactions.push(txn);
            txnIds.add(txn.id);
          }
        }
        // Use the latest balance
        if (acct['balance-date'] > existing['balance-date']) {
          existing.balance = acct.balance;
          existing['available-balance'] = acct['available-balance'];
          existing['balance-date'] = acct['balance-date'];
        }
        // Use latest holdings
        if (acct.holdings.length > 0) {
          existing.holdings = acct.holdings;
        }
      }
    }
  }

  return { errors, accounts: Array.from(accountMap.values()) };
}
