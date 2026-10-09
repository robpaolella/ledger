import { useState } from 'react';
import { ACCESS_LABEL, ACCESS_PRESETS, accessLevelOf, type AccessLevel, type AccessPreset } from '@ledger/shared';
import InlineNotification from '../../InlineNotification';
import { buttonClasses } from '../../buttonClasses';
import { Caption, CheckBox, ICON, btnRow } from '../ui';
import { PERMISSION_GROUPS } from './permissionSwitches';

const btnRowPrimary = buttonClasses({ variant: 'primary', size: 'row' });

const PRESET_ORDER: AccessPreset[] = ['view', 'everyday', 'everything'];

function AccessRow({ label, desc, checked, pending, onPick }: { label: string; desc: React.ReactNode; checked: boolean; pending: boolean; onPick?: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} aria-disabled={!onPick || undefined} onClick={onPick}
      className={`flex items-start gap-3 w-full text-left px-3.5 py-3 rounded-[11px] transition-colors ${pending ? 'border-[1.5px] border-dashed border-primary' : checked ? 'border border-primary' : 'border border-line'} ${onPick ? 'cursor-pointer hover:border-line-strong' : 'cursor-default'}`}
      style={{ background: checked ? 'color-mix(in srgb, var(--primary) 9%, var(--surface))' : 'var(--surface-2)' }}>
      <span aria-hidden="true" className={`w-[19px] h-[19px] flex-none mt-px rounded-full border-[1.5px] bg-surface flex items-center justify-center ${checked || pending ? 'border-primary' : 'border-line-strong'}`}>
        {checked && <span className="w-[9px] h-[9px] rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-content">{label}</span>
        <span className="block text-[12px] text-content-3 leading-snug">{desc}</span>
      </span>
    </button>
  );
}

/** A member's access: three presets (plus Custom when it applies) and the 12 switches behind Customize. */
export default function AccessEditor({ name, permissions, canEdit, onApplyPreset, onTogglePermission }: {
  name: string;
  permissions: Record<string, boolean>;
  canEdit: boolean;
  onApplyPreset: (preset: AccessPreset) => void;
  onTogglePermission: (key: string, current: boolean) => void;
}) {
  const [pending, setPending] = useState<AccessPreset | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const current: AccessLevel = accessLevelOf(permissions);
  const firstName = name.trim().split(/\s+/)[0];

  const pick = (preset: AccessPreset) => {
    if (preset === current) { setPending(null); return; }
    // Custom switches are only replaced after a confirm.
    if (current === 'custom') { setPending(preset); return; }
    onApplyPreset(preset);
  };
  const confirm = () => { if (pending) onApplyPreset(pending); setPending(null); };

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={`Access for ${name}`} className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {PRESET_ORDER.map((k) => (
          <AccessRow key={k} label={ACCESS_PRESETS[k].label} checked={current === k} pending={pending === k}
            desc={pending === k ? <span className="font-semibold text-primary">Picked. Confirm below to apply.</span> : ACCESS_PRESETS[k].desc}
            onPick={canEdit ? () => pick(k) : undefined} />
        ))}
        {current === 'custom' && <AccessRow label={ACCESS_LABEL.custom} desc="Switches chosen one by one, below." checked pending={false} />}
      </div>

      {pending && current === 'custom' && (
        <InlineNotification type="warning" message={`This replaces ${firstName}’s custom switches with ${ACCESS_PRESETS[pending].label}.`}
          actions={(
            <span className="flex gap-2 shrink-0">
              <button type="button" onClick={() => setPending(null)} className={btnRow}>Cancel</button>
              <button type="button" onClick={confirm} className={btnRowPrimary}>Confirm</button>
            </span>
          )} />
      )}

      <div>
        <button type="button" onClick={() => setCustomizing((v) => !v)} aria-expanded={customizing}
          className="inline-flex items-center gap-1.5 min-h-[32px] text-[13px] font-semibold text-content-2 hover:text-content">
          <span className={`flex transition-transform ${customizing ? 'rotate-180' : ''}`}>{ICON.chevron}</span>
          {customizing ? 'Hide switches' : 'Customize'}
        </button>
      </div>

      {customizing && (
        <div className="flex flex-col gap-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <Caption className="mb-2">{group.label}</Caption>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
                {group.permissions.map((p) => {
                  const granted = permissions[p.key] ?? false;
                  return (
                    <button key={p.key} type="button" role="checkbox" aria-checked={granted} aria-disabled={!canEdit || undefined}
                      onClick={canEdit ? () => { setPending(null); onTogglePermission(p.key, granted); } : undefined}
                      className={`flex items-start gap-3 px-3.5 py-[11px] rounded-[11px] border border-line bg-surface-2 text-left transition-colors ${canEdit ? 'hover:border-line-strong' : 'cursor-default'}`}>
                      <CheckBox checked={granted} className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-content">{p.label}</span>
                        <span className="block text-[12px] text-content-3 leading-snug">{p.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
