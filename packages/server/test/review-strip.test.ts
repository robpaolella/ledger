import { describe, expect, it } from 'vitest';
import { reviewStripText, showReviewStrip } from '../../client/src/lib/toolbar';

describe('phone review strip', () => {
  it('reads "N transactions need review" for many', () => {
    expect(reviewStripText(45)).toEqual({ lead: '45 transactions', rest: ' need review', label: '45 transactions need review. Review' });
  });

  it('reads "1 transaction needs review" for one', () => {
    expect(reviewStripText(1)).toEqual({ lead: '1 transaction', rest: ' needs review', label: '1 transaction needs review. Review' });
  });

  it('separates thousands', () => {
    expect(reviewStripText(1234).lead).toBe('1,234 transactions');
  });

  it('is absent with nothing to review (also while loading or failed, when the count stays 0)', () => {
    expect(showReviewStrip(0, false)).toBe(false);
  });

  it('is absent in Select mode and back after it', () => {
    expect(showReviewStrip(45, true)).toBe(false);
    expect(showReviewStrip(45, false)).toBe(true);
  });
});
