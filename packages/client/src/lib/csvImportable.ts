/** Which CSV review rows will actually import, and why the others won't. */

interface ReviewRow {
  categoryId: number | null;
  amount: number | null;
  duplicateStatus: string;
}

export interface CsvImportCounts {
  /** Ticked rows with a category and a readable amount. */
  importable: number;
  /** Importable rows flagged as duplicates. */
  duplicates: number;
  /** Ticked rows left out because they have no category yet. */
  needCategory: number;
  /** Rows whose amount couldn't be read (never importable). */
  unreadable: number;
}

export function csvImportCounts(rows: ReviewRow[], selected: Set<number>): CsvImportCounts {
  const counts: CsvImportCounts = { importable: 0, duplicates: 0, needCategory: 0, unreadable: 0 };
  rows.forEach((r, i) => {
    if (r.amount == null) { counts.unreadable++; return; }
    if (!selected.has(i)) return;
    if (r.categoryId == null) { counts.needCategory++; return; }
    counts.importable++;
    if (r.duplicateStatus !== 'none') counts.duplicates++;
  });
  return counts;
}

/** Footer wording for ticked rows that are skipped for lack of a category. */
export function needCategoryText(n: number): string {
  return `${n} selected ${n === 1 ? 'row' : 'rows'} skipped: choose a category to import.`;
}
