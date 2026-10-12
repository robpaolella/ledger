/** Phone Transactions toolbar: pure rules, kept apart from the page so the server tests can import them. */

export type PhoneToolbarMode = 'select' | 'search' | 'row';

/** Select mode keeps its own rows; otherwise the one 44px row, or the expanded search in its place. */
export const phoneToolbarMode = (bulkMode: boolean, searchOpen: boolean): PhoneToolbarMode =>
  bulkMode ? 'select' : searchOpen ? 'search' : 'row';

/** The "Clear all" line shows only while something is active, and never in Select mode. */
export const showClearAll = (anyActive: boolean, bulkMode: boolean) => anyActive && !bulkMode;

/** Full wording of the review chip; on phones it shows only the count, so this is its accessible name. */
export const reviewChipLabel = (count: number) => `${count.toLocaleString('en-US')} to review`;
