export type LoadState = 'loading' | 'failed' | 'loaded';

/** Which of the three a page shows. A failed load wins over older data (it may belong to a
 *  different month or range), and only a load that has neither failed nor returned is "loading". */
export function loadState({ hasData, failed }: { hasData: boolean; failed: boolean }): LoadState {
  if (failed) return 'failed';
  return hasData ? 'loaded' : 'loading';
}
