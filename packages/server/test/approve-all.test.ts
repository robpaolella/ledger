import { describe, expect, it } from 'vitest';
import { approveAllText } from '../../client/src/lib/approveAll';

const rows = (categorized: number, uncategorized: number) => [
  ...Array.from({ length: categorized }, () => ({ categorized: true })),
  ...Array.from({ length: uncategorized }, () => ({ categorized: false })),
];

describe('approve all dialog text', () => {
  it('counts what clears and what stays', () => {
    const t = approveAllText(rows(18, 26));
    expect(t.approvable).toBe(18);
    expect(t.title).toBe('Mark 18 transactions reviewed?');
    expect(t.body).toBe('26 transactions need a category first and stay in the list.');
  });

  it('uses singular forms', () => {
    const t = approveAllText(rows(1, 1));
    expect(t.title).toBe('Mark 1 transaction reviewed?');
    expect(t.body).toBe('1 transaction needs a category first and stays in the list.');
  });

  it('says it clears everything when all are categorized', () => {
    expect(approveAllText(rows(3, 0)).body).toBe('This clears them from the list.');
    expect(approveAllText(rows(1, 0)).body).toBe('This clears it from the list.');
  });

  it('does not promise approval when nothing is categorized', () => {
    const t = approveAllText(rows(0, 26));
    expect(t.approvable).toBe(0);
    expect(t.title).toBe('Nothing to approve yet');
    expect(t.body).toBe('26 transactions need a category first. Choose one for each and they can be marked reviewed.');
    expect(approveAllText(rows(0, 1)).body).toMatch(/^1 transaction needs a category/);
  });
});
