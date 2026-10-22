import { Card } from '../ui';

const POINTS = [
  'A transaction counts when it’s filed under a tracked category. The category is what says the money was a contribution.',
  'The accounts you choose are where the money goes. Ledger counts the money leaving your other accounts and skips the copy that arrives in these, so nothing counts twice. Money Ledger only sees arriving isn’t counted.',
  'Changes here update past periods on Reports too, as re-categorizing does.',
];

/** The honest rule, in the panel (a card) and in the add/edit window (a compact box). */
export function HowItCounts({ compact = false }: { compact?: boolean }) {
  const list = (
    <ul className={`flex flex-col gap-1.5 leading-snug list-disc pl-[1.2em] ${compact ? 'mt-1.5 text-[12.5px] text-content-3' : 'text-sm text-content-2'}`}>
      {POINTS.map((p) => <li key={p}>{p}</li>)}
    </ul>
  );
  if (compact) {
    return (
      <div className="px-4 py-3.5 rounded-[12px] bg-surface-2 border border-line">
        <div className="text-sm font-bold text-content">How it counts</div>
        {list}
      </div>
    );
  }
  return (
    <Card className="px-4 md:px-6 py-5">
      <div className="text-[17px] font-extrabold tracking-tight text-content mb-3">How it counts</div>
      {list}
    </Card>
  );
}
