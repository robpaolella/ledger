import { describe, expect, it } from 'vitest';
import { convertToLedgerSign } from '../src/services/signConversion.js';

// Ledger convention: positive = money out, negative = money in.
describe('convertToLedgerSign', () => {
  it('turns a SimpleFIN checking deposit into money in', () => {
    expect(convertToLedgerSign(250, 'liquid')).toBe(-250);
  });

  it('turns a SimpleFIN credit card charge into money out', () => {
    expect(convertToLedgerSign(-42.5, 'liability')).toBe(42.5);
  });
});
