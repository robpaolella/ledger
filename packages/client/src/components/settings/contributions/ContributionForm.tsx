import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import type { ContributionSetup, ContributionSetupCreate } from '@ledger/shared/src/types.js';
import { getCategoryEmoji } from '../../../lib/categoryMeta';
import { useIsMobile } from '../../../hooks/useIsMobile';
import ConfirmDeleteButton from '../../ConfirmDeleteButton';
import InlineNotification from '../../InlineNotification';
import ResponsiveModal from '../../ResponsiveModal';
import Spinner from '../../Spinner';
import type { Account } from '../AccountForm';
import type { Category, Group } from '../CategoriesPanel';
import { TYPE_LABEL } from '../simplefin';
import { CheckBox, Field, SelectShell, btnPrimary, btnSecondary, inputCls, selectCls } from '../ui';
import { HowItCounts } from './HowItCounts';

const EmojiPickerPopover = lazy(() => import('../../EmojiPickerPopover'));

const NEW = 'new';
const caption = 'font-mono text-[11px] tracking-[0.1em] uppercase text-content-3 px-3 pt-2.5 pb-1';

function CheckRow({ name, type, checked, inactive, sub, onToggle }: {
  name: string; type?: string; checked: boolean; inactive?: boolean; sub?: string; onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-3 min-h-11 px-3 py-2 rounded-[10px] cursor-pointer hover:bg-surface">
      <input type="checkbox" className="sr-only" checked={checked} onChange={onToggle} />
      <CheckBox checked={checked} />
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-semibold truncate ${inactive ? 'text-content-2' : 'text-content'}`}>{name}</span>
        {sub && <span className="block text-[12px] text-content-3 leading-snug">{sub}</span>}
      </span>
      {inactive && <span className="flex-none h-[22px] px-[9px] rounded-[6px] bg-surface border border-line text-content-3 text-[11px] font-semibold flex items-center">Inactive</span>}
      {type && <span className="text-[12.5px] text-content-3 shrink-0">{type}</span>}
    </label>
  );
}

/** Add (no `setup`) or edit (with `setup`) window. Throws nothing: the server's words show by the action. */
export default function ContributionForm({ setup, trackedIds, categories, groups, accounts, canCreateCategory, onSave, onStop, onClose }: {
  setup?: ContributionSetup;
  /** Categories already tracked: not offered again. */
  trackedIds: Set<number>;
  categories: Category[];
  groups: Group[];
  accounts: Account[];
  canCreateCategory: boolean;
  onSave: (body: Pick<ContributionSetupCreate, 'accountIds' | 'external'> & Partial<ContributionSetupCreate>) => Promise<void>;
  onStop?: () => Promise<void>;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const transferGroups = groups.filter((g) => g.type === 'transfer');
  const options = categories.filter((c) => c.type === 'transfer' && !trackedIds.has(c.id));
  const [choice, setChoice] = useState<string>(options[0] ? String(options[0].id) : canCreateCategory ? NEW : '');
  const [emoji, setEmoji] = useState('🏷️');
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<number | null>(transferGroups[0]?.id ?? null);
  const [picked, setPicked] = useState<Set<number>>(new Set(setup?.accounts.map((a) => a.id)));
  const [external, setExternal] = useState(setup?.external ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ left: 0, top: 0 });
  const boxRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const creating = !setup && choice === NEW;

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return; setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const openPicker = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      setPickerPos({ left: Math.min(Math.max(8, r.left), window.innerWidth - 328), top: below < 420 && r.top > 420 ? r.top - 426 : r.bottom + 6 });
    }
    setPickerOpen(true);
  };

  // Active accounts, investment and retirement first; a deactivated one only while already chosen.
  const shown = accounts.filter((a) => a.is_active || picked.has(a.id));
  const isInvest = (a: Account) => a.type === 'investment' || a.type === 'retirement';
  const rank = (a: Account) => (a.type === 'investment' ? 0 : a.type === 'retirement' ? 1 : 2);
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const toggle = (id: number) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const row = (a: Account) => (
    <CheckRow key={a.id} name={a.name} type={TYPE_LABEL[a.type] ?? a.type} checked={picked.has(a.id)} inactive={!a.is_active} onToggle={() => toggle(a.id)} />
  );

  const submit = async () => {
    if (picked.size === 0 && !external) { setError('Choose at least one account.'); return; }
    let target: Partial<ContributionSetupCreate> = {};
    if (!setup) {
      if (creating) {
        if (!name.trim()) { setError('Enter a name for the new category.'); return; }
        if (!groupId) { setError('Choose a group in Transfers for the new category.'); return; }
        target = { newCategory: { groupId, subName: name.trim(), emoji } };
      } else if (choice) target = { categoryId: Number(choice) };
      else { setError('Choose a category.'); return; }
    }
    setError(null);
    setSaving(true);
    try { await onSave({ ...target, accountIds: [...picked], external }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to save contribution'); }
    finally { setSaving(false); }
  };

  const stop = async () => {
    try { await onStop?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to stop tracking'); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title={setup ? 'Edit contribution' : 'Add contribution'} maxWidth="460px"
      footer={(
        <div>
          {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-3" />}
          <div className="flex items-center gap-2.5">
            {setup && onStop && <ConfirmDeleteButton label="Stop tracking" confirmLabel="Stop tracking?" onConfirmingChange={setConfirmingStop} onConfirm={stop} />}
            {!confirmingStop && <div className="ml-auto flex items-center gap-2.5">
              <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
              <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : setup ? 'Save changes' : 'Add contribution'}</button>
            </div>}
          </div>
        </div>
      )}>
      <div className="flex flex-col gap-5">
        {setup ? (
          <Field label="Category" hint="To track a different category, add another contribution.">
            <div className="flex items-center gap-2.5 min-h-11 px-3.5 py-2 rounded-[11px] bg-surface-2 border border-line text-sm text-content">
              <span className="text-[18px] leading-none">{setup.category.emoji || getCategoryEmoji(setup.category.name, setup.category.groupName)}</span>
              <span className="min-w-0 font-semibold">{setup.category.name}</span>
            </div>
          </Field>
        ) : (
          <Field label="Category" hint="Only Transfers categories you aren’t tracking yet are listed.">
            <SelectShell>
              <select value={choice} onChange={(e) => setChoice(e.target.value)} className={selectCls} aria-label="Category">
                {options.length === 0 && !canCreateCategory && <option value="">No Transfers categories to track</option>}
                {options.length > 0 && <optgroup label="Transfers">{options.map((c) => <option key={c.id} value={c.id}>{c.sub_name}</option>)}</optgroup>}
                {canCreateCategory && <option value={NEW}>New category…</option>}
              </select>
            </SelectShell>
          </Field>
        )}
        {creating && (
          <>
            <Field label="Icon & name" hint="Ledger adds it to Transfers.">
              <div className="flex items-center gap-2.5">
                <button ref={boxRef} type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())} title="Change icon"
                  className="w-11 h-11 flex-none rounded-[11px] bg-surface-2 border border-line-strong flex items-center justify-center text-[20px] cursor-pointer hover:border-primary transition-colors">{emoji}</button>
                {pickerOpen && createPortal(
                  <div ref={popRef} style={{ position: 'fixed', left: pickerPos.left, top: pickerPos.top, width: 320, zIndex: 200 }}
                    className="rounded-[12px] overflow-hidden shadow-md border border-line-strong bg-elevated">
                    <Suspense fallback={<div className="h-[360px] flex items-center justify-center bg-elevated"><Spinner inline size={24} /></div>}>
                      <EmojiPickerPopover onPick={(e) => { setEmoji(e); setPickerOpen(false); }} />
                    </Suspense>
                  </div>,
                  document.body,
                )}
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" aria-label="Category name" autoFocus={!isMobile} className={inputCls} />
              </div>
            </Field>
            {transferGroups.length > 1 && (
              <Field label="Group">
                <SelectShell>
                  <select value={groupId ?? ''} onChange={(e) => setGroupId(Number(e.target.value))} className={selectCls} aria-label="Group">
                    {transferGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </SelectShell>
              </Field>
            )}
          </>
        )}
        <Field label="Pays into" hint={setup && setup.accounts.some((a) => !a.isActive)
          ? `${setup.accounts.filter((a) => !a.isActive).map((a) => a.name).join(', ')} ${setup.accounts.filter((a) => !a.isActive).length === 1 ? 'is' : 'are'} inactive. ${setup.accounts.filter((a) => !a.isActive).length === 1 ? 'It stays' : 'They stay'} listed while chosen.`
          : 'Choose where the money goes. You can choose more than one.'}>
          <div className="rounded-[12px] bg-surface-2 border border-line-strong p-1.5">
            {sorted.some(isInvest) && <div className={caption}>Investment and retirement</div>}
            {sorted.filter(isInvest).map(row)}
            {sorted.some((a) => !isInvest(a)) && <div className={caption}>Other accounts</div>}
            {sorted.filter((a) => !isInvest(a)).map(row)}
            <div className="border-t border-line mt-1.5 pt-2">
              <CheckRow name="An account not in Ledger" sub="For money that leaves for an account Ledger doesn’t track" checked={external} onToggle={() => setExternal((v) => !v)} />
            </div>
          </div>
        </Field>
        <HowItCounts compact />
      </div>
    </ResponsiveModal>
  );
}
