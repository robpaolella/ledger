/**
 * Self-test for merchantNormalize + merchantAliases. No test runner in this repo;
 * standalone assertion script. Run with:
 *
 *   npx tsx packages/server/src/services/merchantNormalize.selftest.ts
 *
 * Exits non-zero on the first failed assertion.
 */
import { normalizeMerchantName } from './merchantNormalize.js';
import { matchAlias } from './merchantAliases.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
  }
}

console.log('normalizeMerchantName — brand aliases');
const aliasCases: [string, string][] = [
  ['AMZN MKTP US*2X9K1', 'Amazon'],
  ['Amazon.com*A1B2C', 'Amazon'],
  ['Amazon Prime*2X9K1', 'Amazon Prime'], // specific alias must win over general Amazon
  ['AMAZON PRIME VIDEO', 'Amazon Prime'],
  ['WM SUPERCENTER #1234', 'Walmart'],
  ['WAL-MART #5023 SAN DIEGO CA', 'Walmart'],
  ['STARBUCKS STORE 00123 SEATTLE WA', 'Starbucks'],
  ['SBUX 800-782-7282', 'Starbucks'],
  ["TRADER JOE'S #456 SAN DIEGO CA", "Trader Joe's"],
  ['CHEVRON 0093423 SAN JOSE CA', 'Chevron'],
  ['COSTCO GAS #0401', 'Costco Gas'],
  ['COSTCO WHSE #0401', 'Costco'],
  ['PP*DOORDASH SF CA', 'DoorDash'],
  ['UBER EATS 8005928996 CA', 'Uber Eats'],
  ['UBER TRIP HELP.UBER.COM', 'Uber'],
  ['NETFLIX.COM 866-579-7172', 'Netflix'],
  ['SpotifyUSA 877-778-1161', 'Spotify'],
  ['VENMO PAYMENT 1234567890', 'Venmo'],
  ['AT&T *PAYMENT 800-331-0500', 'AT&T'],
];
for (const [raw, want] of aliasCases) {
  check(`${raw} → ${want}`, normalizeMerchantName(raw) === want, normalizeMerchantName(raw));
}

console.log('normalizeMerchantName — generic cleanup (no alias)');
const cleanupCases: [string, string][] = [
  ['SQ *COFFEE BAR', 'Coffee Bar'],
  ['TST* THE PIZZA PLACE', 'The Pizza Place'],
  ['POS DEBIT THE CORNER STORE', 'The Corner Store'],
  ['CKE*JAKES DINER #77 AUSTIN TX', 'Jakes Diner Austin Tx'], // prefix/# removed; city+bare state kept (conservative)
  ['STARBUCKS #123 SAN DIEGO CA 92101', 'Starbucks'], // alias wins over the city/state/zip tail
  ['THE CORNER STORE CO', 'The Corner Store Co'], // "Co" suffix preserved (not treated as Colorado)
  ['CREDIT ONE BANK PAYMENT', 'Credit One Bank Payment'], // real name NOT truncated (no "card" token)
  ['DEBIT CARD PURCHASE THE CORNER STORE', 'The Corner Store'], // "debit card purchase" prefix stripped
  ['ACME HARDWARE 12/31', 'Acme Hardware'],
  ['LOCAL BAKERY 2024-01-15', 'Local Bakery'],
  ['THE GYM CO', 'The Gym Co'], // 'CO' preserved (company suffix, not stripped as a state)
];
for (const [raw, want] of cleanupCases) {
  check(`${raw} → ${want}`, normalizeMerchantName(raw) === want, normalizeMerchantName(raw));
}

console.log('normalizeMerchantName — empty / edge');
check('empty → ""', normalizeMerchantName('') === '');
check('null → ""', normalizeMerchantName(null) === '');
check('whitespace → ""', normalizeMerchantName('   ') === '');
check('non-empty never blanks', normalizeMerchantName('####') !== '');

console.log('normalizeMerchantName — idempotency');
const idempotentInputs = [
  ...aliasCases.map(([r]) => r),
  ...cleanupCases.map(([r]) => r),
  'Amazon', 'Coffee Bar', "Trader Joe's", 'AT&T', 'In-N-Out',
];
for (const raw of idempotentInputs) {
  const once = normalizeMerchantName(raw);
  const twice = normalizeMerchantName(once);
  check(`idempotent: ${JSON.stringify(once)}`, once === twice, { once, twice });
}

console.log('matchAlias — specific-before-general ordering');
check('COSTCO GAS → Costco Gas', matchAlias('COSTCO GAS #1') === 'Costco Gas');
check('COSTCO WHSE → Costco', matchAlias('COSTCO WHSE #1') === 'Costco');
check('UBER EATS → Uber Eats', matchAlias('UBER EATS') === 'Uber Eats');
check('UBER TRIP → Uber', matchAlias('UBER TRIP') === 'Uber');
check('unknown → null', matchAlias('SOME LOCAL SHOP') === null);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nAll merchantNormalize self-tests passed.');
