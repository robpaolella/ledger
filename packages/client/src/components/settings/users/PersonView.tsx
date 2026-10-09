import type { AccessPreset } from '@ledger/shared';
import ConfirmDeleteButton from '../../ConfirmDeleteButton';
import ResponsiveModal from '../../ResponsiveModal';
import { Switch } from '../../primitives';
import { ownerColor } from '../../badges';
import { Caption, InitialsAvatar, Pill, ICON, btnPrimary, btnSecondary, btnDanger } from '../ui';
import AccessEditor from './AccessEditor';
import { ROLE_LABEL, canTouch, roleLine, type CallerRole, type ManagedUser } from './people';

const ROLE_TONE: Record<string, string> = { owner: 'var(--c-orange)', admin: 'var(--positive)', member: 'var(--c-blue)' };

const phoneTap = 'max-md:min-h-[44px]';
// Phones: a 44px-tall switch whose visible track stays 26px (transparent borders, background clipped inside them).
const switchTap = 'max-md:h-11 max-md:border-y-[9px] max-md:border-solid max-md:border-transparent max-md:bg-clip-padding! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/** "(you)", Inactive and "Two-step on", after a person's name. */
export function PersonBadges({ mu, isSelf }: { mu: ManagedUser; isSelf: boolean }) {
  return (
    <>
      {isSelf && <span className="text-[12px] text-content-3">(you)</span>}
      {!mu.isActive && <Pill color="var(--negative)" className="h-[22px] px-2 text-[11px]">Inactive</Pill>}
      {mu.twofaEnabled && <Pill color="var(--positive)" className="h-[22px] px-2 text-[11px]">Two-step on</Pill>}
    </>
  );
}

const roleNote = (mu: ManagedUser, callerRole: CallerRole) => mu.role === 'owner' ? 'App owner. Cannot be restricted or removed.'
  : mu.role === 'admin' ? `Admins can use everything and manage members.${callerRole !== 'owner' ? ' Only the owner can change admins.' : ''}` : '';

function RoleControl({ mu, callerRole, isSelf, onSetRole }: { mu: ManagedUser; callerRole: CallerRole; isSelf: boolean; onSetRole: (role: 'admin' | 'member') => void }) {
  if (mu.role === 'owner') return <Pill color={ROLE_TONE.owner} className="h-[26px] rounded-[7px]">Owner</Pill>;
  if (callerRole !== 'owner' || isSelf) return <Pill color={ROLE_TONE[mu.role]} className="h-[26px] rounded-[7px]">{ROLE_LABEL[mu.role]}</Pill>;
  const tone = mu.role === 'admin' ? 'var(--primary)' : 'var(--c-blue)';
  return (
    <div className="relative shrink-0">
      <select value={mu.role} onChange={(e) => onSetRole(e.target.value as 'admin' | 'member')} aria-label={`Role for ${mu.displayName}`}
        className="h-[34px] max-md:h-11 pl-3 pr-8 rounded-[8px] border border-line-strong text-[12.5px] font-bold appearance-none cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={mu.role === 'admin'
          ? { background: 'color-mix(in srgb, var(--primary) 16%, transparent)', color: tone }
          : { background: 'var(--surface-2)', color: tone }}>
        <option value="admin">Admin</option>
        <option value="member">Member</option>
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: tone }}><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}

/** Everything about one person, in the pop-up window (desktop) or bottom sheet (phones). */
export default function PersonView({ mu, callerRole, currentUserId, onClose, onSetRole, onSetActive, onResetTwoStep, onApplyPreset, onTogglePermission, onEdit, onDelete }: {
  mu: ManagedUser;
  callerRole: CallerRole;
  currentUserId: number | undefined;
  onClose: () => void;
  onSetRole: (role: 'admin' | 'member') => void;
  onSetActive: (next: boolean) => void;
  onResetTwoStep: () => Promise<void>;
  onApplyPreset: (preset: AccessPreset) => void;
  onTogglePermission: (key: string, current: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isSelf = mu.id === currentUserId;
  const touch = canTouch(mu, callerRole);
  const note = roleNote(mu, callerRole);

  return (
    <ResponsiveModal isOpen onClose={onClose} title={mu.displayName} description={roleLine(mu)} maxWidth="560px"
      footer={(
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={`${btnPrimary} ${phoneTap} max-md:w-full`}>Done</button>
        </div>
      )}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <InitialsAvatar name={mu.displayName} color={ownerColor(mu.id)} size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[16px] font-bold text-content break-words min-w-0">{mu.displayName}</span>
              <PersonBadges mu={mu} isSelf={isSelf} />
            </div>
            <div className="text-[13px] text-content-3 font-mono truncate">@{mu.username}</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Caption>Role</Caption>
            {note && <div className="text-[12.5px] text-content-3 mt-1 leading-snug">{note}</div>}
          </div>
          <RoleControl mu={mu} callerRole={callerRole} isSelf={isSelf} onSetRole={onSetRole} />
        </div>

        {mu.role === 'member' && mu.permissions && (
          <div>
            <Caption className="mb-2">Access</Caption>
            <AccessEditor name={mu.displayName} permissions={mu.permissions} canEdit={touch}
              onApplyPreset={onApplyPreset} onTogglePermission={onTogglePermission} />
          </div>
        )}

        {touch && !isSelf && (
          <div className="flex flex-col gap-2.5 pt-4 border-t border-line">
            <Caption>Sign-in</Caption>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-content-2">{mu.isActive ? 'Can sign in.' : 'Sign-in is blocked until re-activated.'}</span>
              <Switch checked={mu.isActive} onChange={onSetActive} title="Can sign in" className={switchTap} />
            </div>
            {mu.twofaEnabled && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-content-2">Two-step sign-in is on.</span>
                <ConfirmDeleteButton label="Reset two-step" confirmLabel="Confirm reset?" onConfirm={onResetTwoStep} className={phoneTap} />
              </div>
            )}
            <div className="flex gap-2.5 flex-wrap pt-1">
              <button type="button" onClick={onEdit} className={`${btnSecondary} ${phoneTap}`}>{ICON.pencil}Edit name or password</button>
              <button type="button" onClick={onDelete} className={`${btnDanger} ${phoneTap}`}>{ICON.trash}Delete user</button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
