/**
 * Self-test for transfer pairing. Cases are the real shapes from the ledger
 * (US Bank, Chase, AmEx) plus the near-misses that must NOT pair.
 * Run: npx tsx src/services/transferMatch.selftest.ts
 */
import assert from 'node:assert';
import { pairConfidence, pairTransfers, type LinkCandidate } from './transferMatch.js';

let seq = 1;
const c = (accountId: number, lastFour: string | null, date: string, amount: number, text: string): LinkCandidate =>
  ({ id: seq++, accountId, accountLastFour: lastFour, date, amount, text });

function main() {
  // --- the 26 Jul pair: both legs name the other's last four ---
  const chk = c(1, '2214', '2026-07-26', 400, 'Mobile Banking Transfer Withdrawal 8490');
  const sav = c(2, '8490', '2026-07-26', -400, 'Mobile Banking Transfer Deposit 2214');
  const best = pairConfidence(chk, sav);
  assert.ok(best != null && best > 0.9, `strong pair, got ${best}`);
  assert.equal(pairConfidence(sav, chk), null, 'argument order is out-leg then in-leg');

  // --- hard rules ---
  // Same account: the $28 LATE FEE / LATE FEE REVERSAL trap on one card.
  assert.equal(pairConfidence(
    c(3, '3794', '2026-07-28', 28, 'LATE FEE'),
    c(3, '3794', '2026-07-28', -28, 'LATE FEE REVERSAL'),
  ), null, 'same account never pairs');
  // Two out legs, or two in legs.
  assert.equal(pairConfidence(c(1, '2214', '2026-07-26', 400, 'x'), c(2, '8490', '2026-07-26', 400, 'y')), null);
  // Amount mismatch, and outside the window.
  assert.equal(pairConfidence(c(1, '2214', '2026-07-26', 400, 'x'), c(2, '8490', '2026-07-26', -401, 'y')), null);
  assert.equal(pairConfidence(c(1, '2214', '2026-07-26', 400, 'x'), c(2, '8490', '2026-08-10', -400, 'y')), null);

  // --- legs posting on different days still pair (734.11 landed 07-26 / 07-27) ---
  const gap = pairConfidence(
    c(1, '2214', '2026-07-27', 734.11, 'Web Authorized Pmt Chase Credit Crd'),
    c(4, '6682', '2026-07-26', -734.11, 'Payment Thank You-Mobile'),
  );
  assert.ok(gap != null && gap >= 0.8, `cross-day pair should auto-link, got ${gap}`);

  // Bare text with nothing to corroborate still pairs, but lower.
  const bare = pairConfidence(c(1, '2214', '2026-07-26', 50, ''), c(2, '8490', '2026-07-28', -50, ''));
  assert.ok(bare != null && bare < 0.8, `uncorroborated pair stays below auto-link, got ${bare}`);

  // An account's own last four in its own text proves nothing.
  const selfRef = pairConfidence(c(1, '2214', '2026-07-26', 75, 'Transfer 2214'), c(2, '8490', '2026-07-26', -75, ''));
  const noRef = pairConfidence(c(1, '2214', '2026-07-26', 75, 'Transfer'), c(2, '8490', '2026-07-26', -75, ''));
  assert.equal(selfRef, noRef, 'own last four adds nothing');

  // --- pairTransfers over a pool ---
  {
    seq = 100;
    const pool = [
      c(1, '2214', '2026-07-26', 400, 'Mobile Banking Transfer Withdrawal 8490'),
      c(2, '8490', '2026-07-26', -400, 'Mobile Banking Transfer Deposit 2214'),
      c(3, '3794', '2026-07-28', 28, 'LATE FEE'),
      c(3, '3794', '2026-07-28', -28, 'LATE FEE REVERSAL'),
      c(5, '2910', '2026-08-04', 1200, 'VENMO PAYMENT WEB ID: XXXXXX1992'), // no counterparty leg
    ];
    const { pairs, ambiguous } = pairTransfers(pool);
    assert.equal(pairs.length, 1, 'only the real transfer pairs');
    assert.equal(pairs[0].out.accountId, 1);
    assert.equal(pairs[0].inc.accountId, 2);
    assert.equal(ambiguous.length, 0);
  }

  // Two identical candidates for one leg → refuse both rather than guess.
  {
    seq = 200;
    const pool = [
      c(1, '2214', '2026-07-26', 100, 'Transfer'),
      c(2, '8490', '2026-07-26', -100, 'Transfer'),
      c(3, '6152', '2026-07-26', -100, 'Transfer'),
    ];
    const { pairs, ambiguous } = pairTransfers(pool);
    assert.equal(pairs.length, 0, 'ambiguous pool links nothing');
    assert.ok(ambiguous.length > 0, 'and reports the legs');
  }

  // Corroboration breaks what would otherwise be a tie.
  {
    seq = 300;
    const pool = [
      c(1, '2214', '2026-07-26', 100, 'Transfer Withdrawal 8490'),
      c(2, '8490', '2026-07-26', -100, 'Transfer Deposit 2214'),
      c(3, '6152', '2026-07-26', -100, 'Transfer'),
    ];
    const { pairs } = pairTransfers(pool);
    assert.equal(pairs.length, 1, 'the corroborated pair wins outright');
    assert.equal(pairs[0].inc.accountId, 2);
  }

  // REGRESSION: a strong pair must out-rank a weaker rival for the same in-leg.
  // Clamping the score to 0.99 made these tie, and the ambiguity rule then
  // refused to link either — the real 2026-07-04 $1500 case.
  {
    seq = 400;
    const strong = c(1, '2910', '2026-07-04', 1500, 'Online Transfer to Checking 3732');
    const rival = c(1, '2910', '2026-07-01', 1500, 'Online Realtime Transfer to Paolella Chase Transaction Reference');
    const target = c(2, '3732', '2026-07-04', -1500, 'Online Transfer from Checking 2910');
    assert.ok(pairConfidence(strong, target)! > pairConfidence(rival, target)!, 'mutual naming + same day out-ranks');
    const { pairs, ambiguous } = pairTransfers([strong, rival, target]);
    assert.equal(ambiguous.length, 0, 'a clear winner is not ambiguous');
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].out.id, strong.id, 'the same-day, mutually-naming leg wins');
  }

  console.log('transferMatch selftest: all assertions passed');
}

main();
