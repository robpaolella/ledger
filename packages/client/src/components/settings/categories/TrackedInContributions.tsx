import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContributionSetup } from '@ledger/shared/src/types.js';
import { apiFetch } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { PaysInto } from '../ContributionsPanel';

// Read-only line on a tracked Transfers category's form; setup changes happen in Contributions.
export default function TrackedInContributions({ categoryId }: { categoryId: number }) {
  const { hasPermission } = useAuth();
  const [setup, setSetup] = useState<ContributionSetup | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch<{ data: ContributionSetup[] }>('/contributions/setups')
      .then((res) => { if (live) setSetup(res.data.find((s) => s.category.id === categoryId) ?? null); })
      .catch(() => { /* the line still says it's tracked; only the destinations are left out */ });
    return () => { live = false; };
  }, [categoryId]);

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 rounded-[12px] bg-surface-2 border border-line">
      <span className="text-content-3 shrink-0 mt-px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17h3v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-3a3.2 3.2 0 0 0 2-2h1a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1h-1a5 5 0 0 0-2-4V3a4 4 0 0 0-3.2 1.6l-.3.4H11a6 6 0 0 0-6 6v1a5 5 0 0 0 2 4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1z" /><path d="M16 10h.01M2 8v1a2 2 0 0 0 2 2h1" /></svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-content">Tracked in Contributions</div>
        {setup && <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug"><PaysInto setup={setup} />.</div>}
        {hasPermission('categories.edit') && (
          <Link to="/settings?panel=contributions" className="inline-block mt-1.5 text-[13px] font-bold text-primary">Manage in Contributions</Link>
        )}
      </div>
    </div>
  );
}
