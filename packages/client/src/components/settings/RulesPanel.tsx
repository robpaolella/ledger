import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { getCategoryEmoji, useCategoryEmojis } from '../../lib/categoryMeta';
import ConfirmDeleteButton from '../ConfirmDeleteButton';
import { VendorAvatar } from '../primitives';
import Spinner from '../Spinner';
import { Card, CardHeader, LoadError, PanelHeader, btnRow, ICON } from './ui';

interface Rule {
  id: number; matchType: 'merchant' | 'contains' | 'regex'; pattern: string;
  groupName: string; subName: string; merchantName: string | null;
}
interface Merchant { id: number; name: string; logo_url: string | null; suppress_rule_suggest: number }

const SHOWN_FIRST = 25;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The text a rule matches on: the merchant's name, or the "contains" text / pattern. */
const ruleText = (r: Rule) => (r.matchType === 'merchant' ? (r.merchantName ?? '') : r.pattern);

/** Settings > Household > Rules: every "Always categorize" rule, and the merchants muted from rule suggestions. */
export default function RulesPanel() {
  const { addToast } = useToast();
  useCategoryEmojis(); // re-render when stored category emojis load/change
  const [rules, setRules] = useState<Rule[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setLoadFailed(false);
    try {
      const [ruleRes, merchantRes] = await Promise.all([
        apiFetch<{ data: Rule[] }>('/category-rules'),
        apiFetch<{ data: Merchant[] }>('/merchants'),
      ]);
      setRules(ruleRes.data);
      setMerchants(merchantRes.data);
    } catch { setLoadFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // A merchant rule's pattern is the merchant id; look its logo up from the merchant list.
  const logoById = useMemo(() => new Map(merchants.map((m) => [String(m.id), m.logo_url])), [merchants]);
  const muted = merchants.filter((m) => m.suppress_rule_suggest === 1);

  const q = search.trim().toLowerCase();
  const matches = q
    ? rules.filter((r) => ruleText(r).toLowerCase().includes(q) || r.subName.toLowerCase().includes(q))
    : rules;
  const short = !showAll && !q && matches.length > SHOWN_FIRST;
  const visible = short ? matches.slice(0, SHOWN_FIRST) : matches;

  const deleteRule = async (id: number) => {
    try {
      await apiFetch(`/category-rules/${id}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== id));
      addToast('Rule removed');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Couldn’t remove the rule', 'error');
    }
  };

  const undoMute = async (m: Merchant) => {
    try {
      await apiFetch(`/merchants/${m.id}`, { method: 'PATCH', body: JSON.stringify({ suppressRuleSuggest: false }) });
      setMerchants((prev) => prev.map((x) => (x.id === m.id ? { ...x, suppress_rule_suggest: 0 } : x)));
      addToast(`Ledger will suggest rules for ${m.name} again`);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Couldn’t undo', 'error');
    }
  };

  const header = (
    <PanelHeader title="Rules" description="When you change a transaction’s category, Ledger can offer to always categorize that merchant the same way. Those rules are listed here. Deleting one stops it for new transactions; transactions already categorized stay as they are." />
  );
  if (loadFailed) return <div className="flex flex-col gap-[22px]">{header}<LoadError onRetry={load} /></div>;
  if (loading) return <div className="flex flex-col gap-[22px]">{header}<Spinner /></div>;

  return (
    <div className="flex flex-col gap-[22px]">
      {header}

      <Card>
        <CardHeader title="Always categorize" meta={plural(rules.length, 'rule', 'rules')} />
        {rules.length === 0 ? (
          <div className="border-t border-line px-6 py-10 text-center">
            <div className="text-[15px] font-bold text-content">No rules yet</div>
            <div className="text-sm text-content-3 mt-1 max-w-[440px] mx-auto leading-snug">When you change a transaction’s category, Ledger can offer to remember it, and the rule appears here.</div>
          </div>
        ) : (
          <>
            <div className="px-4 md:px-6 pb-3 -mt-1 text-[12.5px] text-content-3 leading-snug">Ledger checks these in order and uses the first one that matches.</div>
            <div className="px-4 md:px-6 pb-3.5">
              <label className="relative block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-3">{ICON.search}</span>
                <span className="sr-only">Search rules</span>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rules by merchant or category…"
                  className="h-[38px] w-full pl-9 pr-3 rounded-[10px] bg-surface-2 border border-line-strong text-[13.5px] text-content outline-none placeholder:text-content-3" />
              </label>
            </div>
            {visible.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 md:px-6 min-h-[64px] py-2.5 border-t border-line">
                {r.matchType === 'merchant'
                  ? <VendorAvatar name={r.merchantName ?? '?'} src={logoById.get(r.pattern) || undefined} color="var(--c-indigo)" size={34} />
                  : <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-surface-2 text-content-3 flex items-center justify-center shrink-0">{ICON.search}</span>}
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-bold text-content break-words">
                    {r.matchType === 'merchant' ? r.merchantName
                      : r.matchType === 'contains' ? <>Description contains “<span className="font-mono text-[13.5px]">{r.pattern}</span>”</>
                      : <>Description matches the pattern <span className="font-mono text-[13.5px]">{r.pattern}</span></>}
                  </div>
                  <div className="text-[12.5px] text-content-3">
                    <span className="text-content-2 font-semibold">{getCategoryEmoji(r.subName, r.groupName)} {r.subName}</span> · {r.groupName}
                  </div>
                </div>
                <ConfirmDeleteButton onConfirm={() => deleteRule(r.id)} />
              </div>
            ))}
            {short && (
              <button type="button" onClick={() => setShowAll(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 border-t border-line bg-surface-2 text-content-2 text-sm font-bold hover:text-content">
                Show all {matches.length} rules
              </button>
            )}
            {visible.length === 0 && (
              <div className="border-t border-line px-6 py-8 text-center text-sm text-content-3">No rules match “{search.trim()}”.</div>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Not suggesting rules for" meta={muted.length ? plural(muted.length, 'merchant', 'merchants') : undefined} />
        <div className="px-4 md:px-6 pb-3.5 -mt-1 text-[12.5px] text-content-3 leading-snug">Someone chose “Don’t ask again” for these merchants, so Ledger won’t offer a rule when their transactions are recategorized. Undo to get suggestions again.</div>
        {muted.length === 0 ? (
          <div className="border-t border-line px-6 py-5 text-sm text-content-3">None. Ledger offers rules for every merchant.</div>
        ) : muted.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 md:px-6 min-h-[56px] py-2 border-t border-line">
            <VendorAvatar name={m.name} src={m.logo_url || undefined} color="var(--c-amber)" size={30} />
            <span className="flex-1 min-w-0 text-sm font-semibold text-content truncate">{m.name}</span>
            <button type="button" onClick={() => undoMute(m)} className={btnRow}>Undo</button>
          </div>
        ))}
      </Card>
    </div>
  );
}
