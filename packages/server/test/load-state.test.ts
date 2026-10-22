import { describe, expect, it } from 'vitest';
import { loadState } from '../../client/src/lib/loadState';

describe('loadState', () => {
  it('is loading until data arrives or the load fails', () => {
    expect(loadState({ hasData: false, failed: false })).toBe('loading');
  });

  it('is loaded once data is there', () => {
    expect(loadState({ hasData: true, failed: false })).toBe('loaded');
  });

  it('is failed when the load failed and nothing was loaded (no endless spinner)', () => {
    expect(loadState({ hasData: false, failed: true })).toBe('failed');
  });

  it('is failed even when older data is still held, so it is not shown as current', () => {
    expect(loadState({ hasData: true, failed: true })).toBe('failed');
  });
});
