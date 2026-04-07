import { db } from '../db/index.js';
import { accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const TRANSFER_KEYWORDS = [
  /\bpayment\b/i,
  /\bpayment(?=[A-Z])/,         // "PaymentROBERT" — no space after "Payment"
  /\btransfer\b/i,
  /\bthank you\b/i,
  /\bach pmt\b/i,
  /\bauthorized\s+pmt\b/i,
  /\bmobile payment\b/i,
  /\bonline.*transfer\b/i,
  /\bautopay\b/i,
  /\brtp\b/i,                    // Real-Time Payment
  /\bincoming payment/i,
  /\boutgoing payment/i,
];

const AMOUNT_THRESHOLD = 100;

/**
 * Detect whether a transaction is likely an inter-account transfer.
 *
 * Uses two strategies:
 * 1. Generic keyword matching on payee/description
 * 2. Dynamic matching against the user's Ledger account names
 *
 * Only flags transactions > $100 to avoid false positives on small merchants.
 */
export function detectTransfer(
  payee: string,
  description: string,
  amount: number
): boolean {
  if (Math.abs(amount) <= AMOUNT_THRESHOLD) return false;

  const text = `${payee} ${description}`.toLowerCase();

  // 1. Keyword matching
  for (const pattern of TRANSFER_KEYWORDS) {
    if (pattern.test(text)) return true;
  }

  // 2. Dynamic matching against user's account names
  const activeAccounts = db.select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.is_active, 1))
    .all();

  for (const acct of activeAccounts) {
    const acctName = acct.name.toLowerCase();
    if (acctName.length >= 4 && text.includes(acctName)) return true;
  }

  return false;
}

/**
 * Batch transfer detection for multiple transactions.
 */
export function detectTransfers(
  transactions: { payee: string; description: string; amount: number }[]
): boolean[] {
  if (transactions.length === 0) return [];

  // Pre-fetch account names once for the batch
  const activeAccounts = db.select({ name: accounts.name })
    .from(accounts)
    .where(eq(accounts.is_active, 1))
    .all();
  const accountNames = activeAccounts.map((a) => a.name.toLowerCase());

  return transactions.map((txn) => {
    if (Math.abs(txn.amount) <= AMOUNT_THRESHOLD) return false;

    const text = `${txn.payee} ${txn.description}`.toLowerCase();

    // Keyword matching
    for (const pattern of TRANSFER_KEYWORDS) {
      if (pattern.test(text)) return true;
    }

    for (const acctName of accountNames) {
      if (acctName.length >= 4 && text.includes(acctName)) return true;
    }

    return false;
  });
}
