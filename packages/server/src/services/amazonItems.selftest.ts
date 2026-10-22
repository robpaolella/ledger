/**
 * Self-test for the pure Amazon item helpers: allocation math, shipment-subset
 * search, and transaction-note composition.
 * Run: npx tsx src/services/amazonItems.selftest.ts
 */
import assert from 'node:assert';
import { allocateAmounts, composeOrderNote, pickItemSubset } from './amazonItems.js';
import { isStatementCode } from './amazonNotes.js';

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

function main() {
  // --- composeOrderNote: the transaction note ---
  // Single item, whole order.
  let n = composeOrderNote('114-1234567-8901234', [{ title: 'USB-C Cable', quantity: 1 }], false);
  assert.equal(n, 'Amazon #114-1234567-8901234: USB-C Cable');

  // Quantity prefix only above 1, items joined with '; '.
  n = composeOrderNote('114-0000001-0000001', [
    { title: 'AA Batteries', quantity: 4 },
    { title: 'Dish Soap', quantity: 1 },
  ], false);
  assert.equal(n, 'Amazon #114-0000001-0000001: 4× AA Batteries; Dish Soap');

  // Partial shipment the subset search couldn't resolve: says so, lists the order.
  n = composeOrderNote('114-2222222-2222222', [
    { title: 'Thing One', quantity: 1 },
    { title: 'Thing Two', quantity: 1 },
  ], true);
  assert.ok(n.startsWith('Amazon #114-2222222-2222222 (part of a 2-item order): '), n);
  assert.ok(n.includes('Thing One; Thing Two'), n);

  // Long orders are capped and ellipsized — the whole note stays note-sized.
  const many = Array.from({ length: 60 }, (_, i) => ({ title: `Item number ${i} with a long name`, quantity: 1 }));
  n = composeOrderNote('114-3333333-3333333', many, false);
  assert.ok(n.length <= 400, `capped, got ${n.length}`);
  assert.ok(n.endsWith('…'), 'ellipsized');
  assert.ok(n.startsWith('Amazon #114-3333333-3333333: Item number 0'), n.slice(0, 60));

  // --- isStatementCode: which existing notes are safe to replace ---
  // Real shapes found in the live ledger, parked there by an earlier import.
  for (const code of [
    'AMAZON MKTPL*BS55A82H0', 'Amazon.com*BF6IH8OJ2', 'AMZN Mktp US*2X9K1Y3Z',
    'AMAZON DIGITAL*BV1GT1L01', 'amazon prime BF03M31F2',
  ]) assert.ok(isStatementCode(code), `machine text: ${code}`);

  // Anything the user actually wrote stays put.
  for (const written of [
    'Gift for Sam', 'Amazon return pending', 'reimburse from work',
    'Amazon MKTPL*BS55A82H0 — check this', 'birthday',
  ]) assert.ok(!isStatementCode(written), `user text: ${written}`);

  // --- allocateAmounts: split-leg amounts ---
  // Proportional with tax remainder: $54.32 total over $30 + $14.99 items.
  let a = allocateAmounts(54.32, [30.0, 14.99]);
  assert.equal(sum(a), 54.32, 'sums to total');
  assert.ok(a[0] > 30 && a[1] > 14.99, 'tax spread proportionally');

  // Rounding residue lands in the largest bucket, exact-cent invariant.
  a = allocateAmounts(100.0, [33.33, 33.33, 33.33]);
  assert.equal(sum(a), 100.0, 'three-way sums exactly');

  a = allocateAmounts(10.0, [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(sum(a), 10.0, 'seven-way sums exactly');

  // Discounted order (total below item sum) still allocates cleanly.
  a = allocateAmounts(40.0, [30.0, 20.0]);
  assert.equal(sum(a), 40.0);
  assert.equal(a[0], 24.0);
  assert.equal(a[1], 16.0);

  // Degenerate: no price data → zeros (caller falls back).
  a = allocateAmounts(25.0, [0, 0]);
  assert.deepEqual(a, [0, 0]);

  // Tiny amounts don't produce negative legs.
  a = allocateAmounts(0.03, [0.01, 0.02]);
  assert.equal(sum(a), 0.03);
  assert.ok(a.every((x) => x >= 0));

  // --- pickItemSubset: split-shipment attribution ---
  const it = (title: string, unitPrice: number, quantity = 1) => ({ title, unitPrice, quantity });

  // Real shape from the 90-day backfill: $104.98 order billed as $15.07 + $91.58.
  const twoItem = [it('Cheap thing', 13.99), it('Pricey thing', 90.99)];
  let s = pickItemSubset(twoItem, 15.07, 0.08);
  assert.equal(s?.length, 1);
  assert.equal(s?.[0].title, 'Cheap thing', 'small charge → cheap item');
  s = pickItemSubset(twoItem, 98.27, 0.08);
  assert.equal(s?.[0].title, 'Pricey thing', 'large charge → pricey item');

  // Multi-item shipment.
  s = pickItemSubset([it('A', 10), it('B', 20), it('C', 45)], 32.4, 0.08);
  assert.deepEqual(s?.map((x) => x.title), ['A', 'B'], 'picks the A+B shipment');

  // Ambiguous: two identically-priced items → refuse rather than guess.
  assert.equal(pickItemSubset([it('X', 25), it('Y', 25), it('Z', 80)], 27.0, 0.08), null, 'ambiguous → null');

  // Nothing close → null.
  assert.equal(pickItemSubset([it('A', 10), it('B', 20)], 77.0, 0.08), null, 'no fit → null');

  // Quantity is respected.
  s = pickItemSubset([it('Pack', 12.5, 2), it('Single', 40)], 27.0, 0.08);
  assert.equal(s?.[0].title, 'Pack', 'quantity multiplies price');

  // Missing prices → refuse.
  assert.equal(pickItemSubset([{ title: 'A', unitPrice: null, quantity: 1 }, it('B', 10)], 10.8, 0.08), null, 'missing price → null');

  // Too many items → refuse (2^n guard).
  assert.equal(pickItemSubset(Array.from({ length: 15 }, (_, i) => it(`I${i}`, i + 1)), 10, 0.08), null, 'item cap');

  console.log('amazonItems selftest: all assertions passed');
}

main();
