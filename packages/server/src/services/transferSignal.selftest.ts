/**
 * Self-test for the transfer / card-payment signal. No test runner in this repo;
 * standalone assertion script. Run with:
 *
 *   npx tsx packages/server/src/services/transferSignal.selftest.ts
 *
 * Cases are real statement lines pulled from the live ledger, including the ones
 * the old detector missed and the ones it must keep refusing.
 *
 * Exits non-zero on the first failed assertion.
 */
import { detectTransferSignal, type AccountTokens, type TransferSignal } from './transferSignal.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const TOKENS: AccountTokens = {
  all: ['2910', '3732', '6152', '6863', '8897', '2214', '8490', '4836', '3794', '6682', '1009'],
  cards: ['3794', '6682', '1009'],
  names: ['chase college checking', 'us bank savings', 'schwab brokerage', 'venmo'],
};

type Case = {
  name: string;
  description: string;
  bankDescription?: string | null;
  amount: number;
  accountClassification?: string;
  accountType?: string;
  expect: Pick<TransferSignal, 'kind' | 'strength'>;
};

const CASES: Case[] = [
  // ── structural transfer phrasing: strong, no amount floor ──────────────────
  { name: 'online transfer, outbound leg', description: 'Online Transfer to Checking 3732',
    bankDescription: 'Online Transfer to CHK ...3732 transaction#: XXXXXXXXX46 08/24', amount: 2807,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'online transfer, inbound leg', description: 'Online Transfer from Checking 2910',
    bankDescription: 'Online Transfer from CHK ...2910 transaction#: XXXXXXX8446', amount: -2807,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'online realtime transfer', description: 'Online Realtime Transfer to Axos Hys Transaction Reference',
    bankDescription: 'Online Realtime Transfer to Axos HYS 4836 transaction#: XXXXXXX3369', amount: 4000,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'UFB from:/to: format, no "transfer" word', description: 'From Savings',
    bankDescription: 'From: Savings *6863 To: Savings *8897', amount: 1123.51,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'abbreviated Tfr', description: 'Transfer Jpmorgan Chase Ban Robert Paolella',
    bankDescription: 'Tfr JPMORGAN CHASE BAN, ROBERT PAOLELLA', amount: -6000,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'Ext Trnsfr', description: 'Transfer Jpmorgan Chaseweb Robert T Paolella',
    bankDescription: 'Ext Trnsfr JPMorgan ChaseWEB XXXXXXXXXXX4160ROBERT T PAOLELLA', amount: 1137.66,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'mobile banking transfer', description: 'Mobile Banking Transfer',
    bankDescription: 'Mobile Banking Transfer Withdrawal 8490', amount: 400,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'RTP incoming payment (was guessed as Take Home Pay)',
    description: 'Incoming Paymentrobert T Paolella Jpmorgan Chase Bank Na',
    bankDescription: 'RTP Incoming PaymentROBERT T PAOLELLA JPMORGAN CHASE BANK, NA 30521463369', amount: -4000,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: '529 ACH contribution', description: 'Scholarshare Contrib Web',
    bankDescription: 'ScholarShare ACH CONTRIB XXXXXXXXXXX9055 WEB ID: XXXXXX0016', amount: 500,
    expect: { kind: 'transfer', strength: 'strong' } },

  // ── the $100 floor the old detector applied would have dropped these ───────
  { name: 'small Venmo funding transfer', description: 'Transfer to Venmo',
    bankDescription: 'VENMO PAYMENT XXXXXXXXX5076 WEB ID: XXXXXX1992', amount: 32.22,
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'small Venmo inbound transfer', description: 'Transfer from Venmo',
    bankDescription: 'Electronic Deposit Venmo', amount: -11.49,
    expect: { kind: 'transfer', strength: 'strong' } },

  // ── credit-card payments ──────────────────────────────────────────────────
  { name: 'card leg, bare "Payment" (was guessed as Dining/Eating Out)',
    description: 'Payment', bankDescription: 'Payment Thank You-Mobile', amount: -903.52,
    accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'card-payment', strength: 'strong' } },
  { name: 'card leg, mobile payment', description: 'Payment', bankDescription: 'MOBILE PAYMENT - THANK YOU',
    amount: -1871.66, accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'card-payment', strength: 'strong' } },
  { name: 'bank leg naming a tracked card by last four', description: 'Chase Credit Card',
    bankDescription: 'Payment to Chase card ending in 3794 08/24', amount: 903.52,
    accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'card-payment', strength: 'strong' } },
  { name: 'bank leg naming an UNTRACKED card stays weak (TJX card is not in the ledger)',
    description: 'TJX Rewards Credit Card', bankDescription: 'Web Authorized Pmt Tjx Rew Mstrcrd', amount: 173.79,
    accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'card-payment', strength: 'weak' } },
  { name: 'bank leg, AmEx by name but no last four', description: 'American Express Credit Card',
    bankDescription: 'AMERICAN EXPRESS ACH PMT M1506 WEB ID: XXXXXX2111', amount: 1871.66,
    accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'card-payment', strength: 'weak' } },

  { name: 'bank leg, card named with no payment word at all', description: 'Chase Credit Card',
    bankDescription: null, amount: 649.65, accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'card-payment', strength: 'weak' } },

  // ── the counterparty is one of the user's own accounts ────────────────────
  { name: 'whole description is an account name', description: 'Schwab Brokerage',
    bankDescription: null, amount: 6000, accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'transfer', strength: 'strong' } },
  { name: 'account name as a substring is NOT enough (Venmo purchase)',
    description: 'Venmo payment to Bob for dinner', bankDescription: null, amount: 24,
    accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'transfer', strength: 'weak' } },

  // ── things the signal must refuse ─────────────────────────────────────────
  { name: 'late fee is a balance adjustment, not a transfer', description: 'Late Fee',
    bankDescription: 'LATE FEE', amount: 28, accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'late fee reversal is a balance adjustment', description: 'Late Fee',
    bankDescription: 'LATE FEE REVERSAL', amount: -28, accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'card refund is not a payment', description: 'Amazon', bankDescription: 'AMAZON.COM REFUND',
    amount: -483.8, accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'an ordinary withdrawal is not a transfer', description: 'Customer Withdrawal',
    bankDescription: null, amount: 120, accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'a travel visa fee is not a card payment', description: 'Visa Application Fee',
    bankDescription: 'US DEPT OF STATE VISA FEE', amount: 185,
    accountClassification: 'liquid', accountType: 'checking',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'ordinary purchase', description: 'Starbucks', bankDescription: 'STARBUCKS STORE 00456 SEATTLE WA',
    amount: 6.25, accountClassification: 'liability', accountType: 'credit',
    expect: { kind: 'transfer', strength: 'none' } },
  { name: 'a merchant last four is not corroboration on its own',
    description: 'Some Store 2910', bankDescription: 'SOME STORE 2910 ANYTOWN', amount: 45,
    expect: { kind: 'transfer', strength: 'none' } },
];

console.log('transfer signal');
for (const c of CASES) {
  const got = detectTransferSignal(c, TOKENS);
  const ok = got.strength === c.expect.strength
    && (c.expect.strength === 'none' || got.kind === c.expect.kind);
  check(c.name, ok, { got, want: c.expect });
}

console.log('\nlast-four matching is token-bounded');
{
  // '8446' inside a masked reference number must not read as account '8446'.
  const t: AccountTokens = { all: ['8446'], cards: [], names: [] };
  const r = detectTransferSignal(
    { description: 'Payment', bankDescription: 'SOME PAYMENT transaction#: XXXXXXX8446', amount: 50 }, t);
  check('digits glued to letters do not corroborate', r.strength === 'weak', r);

  const r2 = detectTransferSignal(
    { description: 'Payment', bankDescription: 'SOME PAYMENT ...8446', amount: 50 }, t);
  check('a standalone last four does corroborate', r2.strength === 'strong', r2);

  const r3 = detectTransferSignal(
    { description: 'Payment', bankDescription: 'SOME PAYMENT 84461', amount: 50 }, t);
  check('a longer number does not corroborate', r3.strength === 'weak', r3);
}

console.log(failures === 0 ? '\nAll transfer-signal checks passed' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
