import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getCategoryEmoji, getCategoryColorVar } from '../../lib/categoryMeta';
import ConfirmDeleteButton from '../ConfirmDeleteButton';
import InlineNotification from '../InlineNotification';
import ResponsiveModal from '../ResponsiveModal';
import Spinner from '../Spinner';
import { Switch } from '../primitives';
import { Field, PanelHeader, SelectShell, inputCls, selectCls, btnPrimary, btnSecondary, ICON } from './ui';

const EmojiPickerPopover = lazy(() => import('../EmojiPickerPopover'));

export interface Category {
  id: number;
  group_name: string;
  sub_name: string;
  display_name: string;
  type: string;
  is_deductible: number;
  sort_order: number;
  emoji?: string | null;
  exclude_from_budget?: number;
  group_id?: number | null;
}

export interface Group {
  id: number;
  name: string;
  type: string;
  color: string | null;
  sort_order: number;
  count: number;
}

const SECTION_LABEL: Record<string, string> = { income: 'Income', expense: 'Expenses', transfer: 'Transfers' };

// --- Sortable category row ---
function SortableRow({ cat, canEdit, onEdit }: { cat: Category; canEdit: boolean; onEdit: (c: Category) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const restrictedTransform = transform ? { ...transform, x: 0 } : transform;
  const style = { transform: CSS.Transform.toString(restrictedTransform), transition, ...(isDragging ? { zIndex: 10, position: 'relative' as const } : {}) };
  return (
    <div ref={setNodeRef} style={style}
      onClick={() => canEdit ? onEdit(cat) : null}
      className={`group/row flex items-center gap-3.5 px-5 h-[52px] border-b border-line ${canEdit ? 'cursor-pointer hover:bg-elevated' : ''} ${isDragging ? 'bg-elevated shadow-md' : ''}`}>
      {canEdit && (
        <span {...attributes} {...listeners} onClick={(e) => e.stopPropagation()} title="Drag to reorder"
          className="flex-none text-content-3 cursor-grab opacity-0 group-hover/row:opacity-60 transition-opacity touch-none">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>
        </span>
      )}
      <span className="flex-none text-[17px] leading-none w-[22px] text-center">{cat.emoji || getCategoryEmoji(cat.sub_name)}</span>
      <span className="flex-1 text-[14.5px] font-semibold text-content">{cat.sub_name}</span>
      {cat.exclude_from_budget ? (
        <span className="flex-none h-[22px] px-[9px] rounded-[6px] bg-surface-2 border border-line text-content-3 text-[11px] font-semibold flex items-center">Excluded from budget</span>
      ) : null}
      {canEdit && <span className="flex-none text-content-3 opacity-0 group-hover/row:opacity-100 transition-opacity"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg></span>}
    </div>
  );
}

// --- Category form ---
function CategoryForm({ category, groups, initialGroupId, onSave, onDelete, onClose }: {
  category?: Category;
  groups: Group[];
  initialGroupId?: number | null;
  onSave: (data: Record<string, unknown>) => Promise<void> | void;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [emoji, setEmoji] = useState(category?.emoji || '🏷️');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const boxRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [subName, setSubName] = useState(category?.sub_name ?? '');
  const [groupId, setGroupId] = useState<number | null>(category?.group_id ?? initialGroupId ?? groups[0]?.id ?? null);
  const [excludeFromBudget, setExcludeFromBudget] = useState(category?.exclude_from_budget === 1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Transfers move money between the user's own accounts, so they are never
  // spending: budget exclusion is an invariant of the section, not a preference.
  const isTransfer = groups.find((g) => g.id === groupId)?.type === 'transfer';

  const PICKER_W = 320, PICKER_H = 420;
  const openPicker = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (r) {
      const spaceBelow = window.innerHeight - r.bottom;
      const top = spaceBelow < PICKER_H && r.top > PICKER_H ? r.top - PICKER_H - 6 : r.bottom + 6;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - PICKER_W - 8);
      setPickerPos({ left, top });
    }
    setPickerOpen(true);
  };

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t); } }, [error]);
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (boxRef.current?.contains(t) || popRef.current?.contains(t)) return; setPickerOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const submit = async () => {
    if (!subName.trim()) { setError('Category name is required'); return; }
    if (!groupId) { setError('Choose a group'); return; }
    setSaving(true);
    try { await onSave({ groupId, subName: subName.trim(), emoji, excludeFromBudget: isTransfer || excludeFromBudget }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to save category'); }
    finally { setSaving(false); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title={category ? 'Edit category' : 'New category'} maxWidth="460px"
      footer={(
        <div className="flex items-center gap-2.5">
          {category && onDelete && <ConfirmDeleteButton onConfirm={async () => { const err = await onDelete(); if (err) setError(err); }} />}
          <div className="ml-auto flex items-center gap-2.5">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : category ? 'Save changes' : 'Create category'}</button>
          </div>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-4" />}
      <div className="flex flex-col gap-5">
        <Field label="Icon & name">
          <div className="flex items-center gap-2.5">
            <button ref={boxRef} type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())} title="Change icon"
              className="w-11 h-11 flex-none rounded-[11px] bg-surface-2 border border-line-strong flex items-center justify-center text-[20px] cursor-pointer hover:border-primary transition-colors">
              {emoji}
            </button>
            {pickerOpen && createPortal(
              <div ref={popRef} style={{ position: 'fixed', left: pickerPos.left, top: pickerPos.top, width: PICKER_W, zIndex: 200 }}
                className="rounded-[12px] overflow-hidden shadow-md border border-line-strong bg-elevated">
                <Suspense fallback={<div className="h-[360px] flex items-center justify-center bg-elevated"><Spinner inline size={24} /></div>}>
                  <EmojiPickerPopover onPick={(e) => { setEmoji(e); setPickerOpen(false); }} />
                </Suspense>
              </div>,
              document.body,
            )}
            <input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Category name" autoFocus={!category} className={inputCls}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
        </Field>
        <Field label="Group" hint={category && category.group_id !== groupId ? 'The category moves to this group when you save.' : undefined}>
          <SelectShell>
            <select value={groupId ?? ''} onChange={(e) => setGroupId(Number(e.target.value))} className={selectCls}>
              {['income', 'expense', 'transfer'].map((t) => {
                const gs = groups.filter((g) => g.type === t);
                if (gs.length === 0) return null;
                return <optgroup key={t} label={SECTION_LABEL[t]}>{gs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>;
              })}
            </select>
          </SelectShell>
        </Field>
        <div className="flex items-center justify-between gap-4 px-4 py-3.5 rounded-[12px] bg-surface-2 border border-line">
          <div className="min-w-0">
            <div className="text-sm font-bold text-content">Exclude from budget</div>
            <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug">
              {isTransfer ? 'Always excluded — transfers move money between your own accounts, so they are never budgeted.' : 'This category and its transactions will be hidden from your budget.'}
            </div>
          </div>
          {isTransfer ? (
            <span title="Permanent for the Transfers section" className="flex-none inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[11.5px] font-bold text-content-3 bg-surface border border-line">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
              Always
            </span>
          ) : (
            <Switch checked={excludeFromBudget} onChange={setExcludeFromBudget} title="Exclude from budget" />
          )}
        </div>
      </div>
    </ResponsiveModal>
  );
}

// --- Group form (create / rename a category group) ---
const GROUP_COLORS = ['c-teal', 'c-green', 'c-blue', 'c-indigo', 'c-violet', 'c-fuchsia', 'c-rose', 'c-orange', 'c-amber'];

function GroupForm({ mode, type, name: initialName, color: initialColor, canDelete, onSave, onDelete, onClose }: {
  mode: 'new' | 'edit';
  type: string;
  name?: string;
  color?: string | null;
  canDelete?: boolean;
  onSave: (name: string, color: string) => Promise<void> | void;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [color, setColor] = useState(initialColor && GROUP_COLORS.includes(initialColor) ? initialColor : GROUP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 6000); return () => clearTimeout(t); } }, [error]);

  const submit = async () => {
    if (!name.trim()) { setError('Group name is required'); return; }
    setSaving(true);
    try { await onSave(name.trim(), color); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to save group'); }
    finally { setSaving(false); }
  };

  return (
    <ResponsiveModal isOpen onClose={onClose} title={mode === 'new' ? 'New group' : 'Edit group'} description={`${SECTION_LABEL[type]} section`} maxWidth="440px"
      footer={(
        <div className="flex items-center gap-2.5">
          {mode === 'edit' && onDelete && canDelete && <ConfirmDeleteButton onConfirm={async () => { const err = await onDelete(); if (err) setError(err); }} />}
          <div className="ml-auto flex items-center gap-2.5">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="button" onClick={submit} disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : mode === 'new' ? 'Create group' : 'Save changes'}</button>
          </div>
        </div>
      )}>
      {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError(null)} className="mb-4" />}
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <div className="flex items-center gap-2.5">
            <span className="w-11 h-11 flex-none rounded-[11px] border border-line-strong" style={{ background: `var(--${color})` }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name" autoFocus className={inputCls} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          </div>
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-2.5">
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} title={c} aria-pressed={color === c}
                className="w-11 h-11 rounded-[11px] flex items-center justify-center cursor-pointer"
                style={{ background: `var(--${c})`, boxShadow: color === c ? '0 0 0 2px var(--elevated), 0 0 0 4px var(--primary)' : 'none' }}>
                {color === c && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--on-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
            ))}
          </div>
        </Field>
        {mode === 'edit' && !canDelete && <div className="text-[12.5px] text-content-3">Move or delete this group’s categories before you can delete it.</div>}
      </div>
    </ResponsiveModal>
  );
}

// --- Panel ---
export default function CategoriesPanel({ categories, groups, onChanged }: {
  categories: Category[];
  groups: Group[];
  onChanged: () => Promise<void> | void;
}) {
  const { addToast } = useToast();
  const { hasPermission } = useAuth();
  const [editingCategory, setEditingCategory] = useState<Category | null | 'new'>(null);
  const [newCatGroupId, setNewCatGroupId] = useState<number | null>(null);
  const [groupModal, setGroupModal] = useState<{ mode: 'new' | 'edit'; type: string; id?: number; name?: string; color?: string | null; count?: number } | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<number, number>>({}); // optimistic sort_order overrides

  const catsByGroup = new Map<number, Category[]>();
  for (const cat of categories) {
    if (cat.group_id == null) continue;
    if (!catsByGroup.has(cat.group_id)) catsByGroup.set(cat.group_id, []);
    catsByGroup.get(cat.group_id)!.push(cat);
  }
  for (const arr of catsByGroup.values()) arr.sort((a, b) => (localOrder[a.id] ?? a.sort_order) - (localOrder[b.id] ?? b.sort_order));
  const groupsByType: Record<string, Group[]> = { income: [], expense: [], transfer: [] };
  for (const g of [...groups].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))) {
    if (groupsByType[g.type]) groupsByType[g.type].push(g);
  }

  const saveCategory = async (data: Record<string, unknown>) => {
    if (editingCategory === 'new') await apiFetch('/categories', { method: 'POST', body: JSON.stringify(data) });
    else if (editingCategory) await apiFetch(`/categories/${editingCategory.id}`, { method: 'PUT', body: JSON.stringify(data) });
    setEditingCategory(null); setNewCatGroupId(null);
    addToast('Category saved');
    await onChanged();
  };
  const deleteCategory = async (): Promise<string | null> => {
    if (!editingCategory || editingCategory === 'new') return null;
    try {
      await apiFetch(`/categories/${editingCategory.id}`, { method: 'DELETE' });
      setEditingCategory(null); addToast('Category deleted'); await onChanged(); return null;
    } catch (err) { return err instanceof Error ? err.message : 'Delete failed'; }
  };
  const saveGroup = async (name: string, color: string) => {
    if (!groupModal) return;
    if (groupModal.mode === 'new') { await apiFetch('/categories/groups', { method: 'POST', body: JSON.stringify({ type: groupModal.type, name, color }) }); addToast('Group created'); }
    else { await apiFetch(`/categories/groups/${groupModal.id}`, { method: 'PUT', body: JSON.stringify({ name, color }) }); addToast('Group saved'); }
    setGroupModal(null);
    await onChanged();
  };
  const deleteGroup = async (): Promise<string | null> => {
    if (!groupModal || groupModal.mode !== 'edit' || !groupModal.id) return null;
    try {
      await apiFetch(`/categories/groups/${groupModal.id}`, { method: 'DELETE' });
      setGroupModal(null); addToast('Group deleted'); await onChanged(); return null;
    } catch (err) { return err instanceof Error ? err.message : 'Delete failed'; }
  };

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const dndSensors = useSensors(pointerSensor, touchSensor);

  const onDragEnd = async (event: DragEndEvent, groupSubs: Category[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groupSubs.findIndex((s) => s.id === active.id);
    const newIndex = groupSubs.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const items = arrayMove(groupSubs, oldIndex, newIndex).map((s, i) => ({ id: s.id, sort_order: i }));
    setLocalOrder((prev) => { const n = { ...prev }; for (const it of items) n[it.id] = it.sort_order; return n; });
    try { await apiFetch('/categories/reorder', { method: 'PUT', body: JSON.stringify({ items }) }); await onChanged(); setLocalOrder({}); }
    catch { addToast('Failed to save sort order', 'error'); setLocalOrder({}); }
  };

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Categories" description="Groups and categories are shared by the whole household. Changes apply everywhere in Ledger — tailor the structure to fit how you budget." />

      {(['income', 'expense', 'transfer'] as const).map((t) => (
        <div key={t}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[18px] font-extrabold tracking-tight">{SECTION_LABEL[t]}</span>
            {t !== 'transfer' && hasPermission('categories.create') && (
              <button type="button" onClick={() => setGroupModal({ mode: 'new', type: t })} className="text-sm font-bold text-primary">Create group</button>
            )}
          </div>
          <div className="flex flex-col gap-3.5">
            {groupsByType[t].map((g) => {
              const cats = catsByGroup.get(g.id) ?? [];
              return (
                <div key={g.id} className="border border-line rounded-[16px] bg-surface overflow-hidden shadow-sm">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 bg-surface-2 border-b border-line">
                    <span className="w-3.5 h-3.5 shrink-0 rounded-[4px]" style={{ background: g.color ? `var(--${g.color})` : getCategoryColorVar(g.name) }} />
                    <span className="text-[15px] font-bold text-content">{g.name}</span>
                    {hasPermission('categories.edit') && (
                      <button type="button" onClick={() => setGroupModal({ mode: 'edit', type: g.type, id: g.id, name: g.name, color: g.color, count: cats.length })} className="text-[13px] font-semibold text-content-3 hover:text-primary">Edit</button>
                    )}
                    <span className="ml-auto font-mono text-[12px] text-content-3">{cats.length} {cats.length === 1 ? 'category' : 'categories'}</span>
                  </div>
                  <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(e, cats)}>
                    <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                      {cats.map((c) => <SortableRow key={c.id} cat={c} canEdit={hasPermission('categories.edit')} onEdit={(cc) => setEditingCategory(cc)} />)}
                    </SortableContext>
                  </DndContext>
                  {t !== 'transfer' && hasPermission('categories.create') ? (
                    <button type="button" onClick={() => { setNewCatGroupId(g.id); setEditingCategory('new'); }} className="flex items-center gap-2.5 px-5 h-12 w-full text-content-3 text-sm font-semibold hover:text-primary transition-colors">
                      {ICON.plus} Create category
                    </button>
                  ) : cats.length === 0 ? (
                    <div className="px-5 h-12 flex items-center text-sm text-content-3">No categories</div>
                  ) : null}
                </div>
              );
            })}
            {t === 'transfer' && groupsByType[t].length > 0 && (
              <div className="text-[13px] text-content-3 px-1">Applied automatically to money moving between your own accounts — kept out of income, expense, and budget totals.</div>
            )}
            {t !== 'transfer' && groupsByType[t].length === 0 && (
              <div className="text-[13px] text-content-3 px-1">No groups yet{hasPermission('categories.create') ? ' — use “Create group” to add one.' : '.'}</div>
            )}
          </div>
        </div>
      ))}

      {editingCategory !== null && (
        <CategoryForm
          category={editingCategory === 'new' ? undefined : editingCategory}
          groups={groups}
          initialGroupId={editingCategory === 'new' ? newCatGroupId : undefined}
          onSave={saveCategory}
          onDelete={editingCategory !== 'new' && hasPermission('categories.delete') ? deleteCategory : undefined}
          onClose={() => { setEditingCategory(null); setNewCatGroupId(null); }}
        />
      )}
      {groupModal !== null && (
        <GroupForm
          mode={groupModal.mode} type={groupModal.type} name={groupModal.name} color={groupModal.color}
          canDelete={groupModal.mode === 'edit' && (groupModal.count ?? 0) === 0}
          onSave={saveGroup}
          onDelete={groupModal.mode === 'edit' && hasPermission('categories.delete') ? deleteGroup : undefined}
          onClose={() => setGroupModal(null)}
        />
      )}
    </div>
  );
}
