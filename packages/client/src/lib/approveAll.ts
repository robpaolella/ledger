const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Wording for the Reviews "Approve all" dialog. Uncategorized rows can't be approved, so say up front how many will clear and how many stay. */
export function approveAllText(rows: { categorized: boolean }[]) {
  const approvable = rows.filter((r) => r.categorized).length;
  const staying = rows.length - approvable;
  if (approvable === 0) {
    return {
      approvable,
      title: 'Nothing to approve yet',
      body: `${plural(staying, 'transaction needs', 'transactions need')} a category first. Choose one for each and they can be marked reviewed.`,
    };
  }
  return {
    approvable,
    title: `Mark ${plural(approvable, 'transaction', 'transactions')} reviewed?`,
    body: staying === 0
      ? `This clears ${approvable === 1 ? 'it' : 'them'} from the list.`
      : `${plural(staying, 'transaction needs', 'transactions need')} a category first and ${staying === 1 ? 'stays' : 'stay'} in the list.`,
  };
}
