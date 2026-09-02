import { useNavigate } from 'react-router-dom';
import { useCachedApi } from '../useCachedApi';
import { VendorAvatar } from '../../primitives';
import { getCategoryColorHex } from '../../../lib/categoryMeta';
import DashboardCard, { CardSkeleton, CardError, CardHeaderLink } from '../DashboardCard';
import type { DashboardCardProps } from '../cardRegistry';

interface RecentTxn {
  id: number;
  description: string;
  amount: number;
  merchant: { id: number; name: string; logoUrl: string | null } | null;
  category: { id: number; groupName: string; subName: string; displayName: string | null; type: string } | null;
  splits: { categoryId: number; groupName: string; subName: string; displayName: string | null; type: string; amount: number }[] | null;
}

const usd2 = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Category label + dot color: own category, or the first non-hidden split leg
// (+N when the split has more legs).
function categoryOf(t: RecentTxn): { label: string; groupName: string | undefined } {
  if (t.category) return { label: t.category.displayName ?? t.category.subName, groupName: t.category.groupName };
  if (t.splits && t.splits.length > 0) {
    const first = t.splits[0];
    const extra = t.splits.length - 1;
    return { label: `${first.displayName ?? first.subName}${extra > 0 ? ` +${extra}` : ''}`, groupName: first.groupName };
  }
  return { label: 'Uncategorized', groupName: undefined };
}

export default function TransactionsCard({ dragHandleProps }: DashboardCardProps) {
  const navigate = useNavigate();
  const { data, error } = useCachedApi<{ data: RecentTxn[] }>('/dashboard/recent-transactions?limit=5');
  const txns = data?.data ?? null;

  return (
    <DashboardCard
      title="Transactions"
      subtitle={<>
        <span className="hidden md:inline text-[15px] font-semibold text-content-3">Most recent</span>
        <button type="button" onClick={() => navigate('/transactions')} className="md:hidden inline-flex items-center gap-1 text-[15px] font-semibold text-content-3 -ml-0.5 pl-0.5 active:text-content">
          Most recent<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </>}
      headerRight={<CardHeaderLink small onClick={() => navigate('/transactions')}>All transactions</CardHeaderLink>}
      hideRightOnPhone
      dragHandleProps={dragHandleProps}
    >
      {error && !txns ? (
        <CardError message="Couldn't load transactions." />
      ) : !txns ? (
        <CardSkeleton lines={4} />
      ) : txns.length === 0 ? (
        <CardError message="No recent transactions." />
      ) : (
        txns.map((t) => {
          const cat = categoryOf(t);
          const color = getCategoryColorHex(cat.groupName);
          const vendor = t.merchant?.name ?? t.description;
          return (
            <div
              key={t.id}
              onClick={() => navigate(`/transactions?review=${t.id}`)}
              className="flex items-center gap-3.5 px-4 md:px-6 h-14 md:h-[46px] border-t border-line cursor-pointer hover:bg-surface-2/40"
            >
              <VendorAvatar name={vendor} src={t.merchant?.logoUrl || undefined} color={color} size={28} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[15px] truncate">{vendor}</div>
                {/* phones: category drops under the name so neither is squeezed */}
                <div className="md:hidden flex items-center gap-1.5 text-[12px] text-content-3 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-none" style={{ background: color }} />
                  <span className="truncate">{cat.label}</span>
                </div>
              </div>
              <div className="hidden md:flex flex-none items-center gap-2 text-sm text-content-2">
                <span className="w-[9px] h-[9px] rounded-full flex-none" style={{ background: color }} />
                {cat.label}
              </div>
              <div className="md:w-[92px] flex-none text-right font-bold text-[15px] tabular-nums">{usd2(t.amount)}</div>
              <svg className="flex-none text-content-3" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </div>
          );
        })
      )}
    </DashboardCard>
  );
}
