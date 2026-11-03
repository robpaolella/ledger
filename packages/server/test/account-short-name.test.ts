import { describe, expect, it } from 'vitest';
import { accountShortName } from '../../client/src/lib/accounts';

describe('accountShortName', () => {
  it('shows the last four for phone rows', () => {
    expect(accountShortName({ name: "Jane's Emergency Savings", lastFour: '4417' })).toBe('•• 4417');
  });
  it('accepts the snake_case field too', () => {
    expect(accountShortName({ name: 'Checking', last_four: '9102' })).toBe('•• 9102');
  });
  it('falls back to the name with no last four', () => {
    expect(accountShortName({ name: 'Cash', lastFour: null })).toBe('Cash');
    expect(accountShortName({ name: 'Cash', lastFour: '  ' })).toBe('Cash');
    expect(accountShortName({ name: 'Cash' })).toBe('Cash');
  });
});
