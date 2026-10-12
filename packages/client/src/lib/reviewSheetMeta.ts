/** The two pieces of the Review detail sheet's description line: "date ·" then the account. */
export function reviewSheetMeta(dateText: string, accountName: string, lastFour?: string | null) {
  const account = lastFour ? `${accountName} (${lastFour})` : accountName;
  return { dateText, account, tooltip: `${dateText} · ${account}` };
}
