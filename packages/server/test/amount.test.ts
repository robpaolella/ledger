import { describe, expect, it } from 'vitest';
import { readAmount } from '@ledger/shared';

describe('readAmount', () => {
  it.each([
    ['$1,234.50', 1234.5],
    ['+12.00', 12],
    ['(123.45)', -123.45],
    ['($1,234.50)', -1234.5],
    ['-5', -5],
    ['-$5.25', -5.25],
    ['12', 12],
    ['12.5', 12.5],
    ['.5', 0.5],
    [' 7.10 ', 7.1],
    ['0', 0],
    ['0.00', 0],
  ])('reads %j as %d', (raw, expected) => {
    expect(readAmount(raw)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '--', '$', '12abc', '1.2.3', '(-5)', '(5', '5)', '-(5)', '1-2', '()', '.', '-'])(
    'flags %j as unreadable, never 0',
    (raw) => {
      expect(readAmount(raw)).toBeNull();
    },
  );

  it('flags a missing cell as unreadable', () => {
    expect(readAmount(undefined)).toBeNull();
    expect(readAmount(null)).toBeNull();
  });
});
