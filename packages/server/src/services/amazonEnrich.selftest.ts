/**
 * Self-test for Amazon enrichment allocation math.
 * Run: npx tsx src/services/amazonEnrich.selftest.ts
 */
import assert from 'node:assert';
import { allocateAmounts } from './amazonEnrich.js';

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

function main() {
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

  console.log('amazonEnrich selftest: all assertions passed');
}

main();
