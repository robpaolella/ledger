import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { SegmentedControl } from '../primitives';
import { Card, CardHeader, Field, PanelHeader, Pill, InitialsAvatar, inputCls, btnPrimary } from './ui';

const ROLE_TONE: Record<string, string> = { owner: 'var(--c-orange)', admin: 'var(--positive)', member: 'var(--c-blue)' };
const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

const ROLE_SENTENCE: Record<string, string> = {
  owner: 'You own this Ledger. You can use everything and manage everyone.',
  admin: 'Admins can use everything and manage members.',
  member: 'Your access is set by the owner or an admin.',
};

const sun = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const moon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;

/** Settings → Profile: who you are in this household + how the app looks. */
export default function ProfilePanel() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  const dirty = displayName.trim() !== (user?.displayName ?? '') && displayName.trim() !== '';

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    try {
      await apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify({ displayName: displayName.trim() }) });
      await refreshUser();
      addToast('Profile updated');
    } catch {
      addToast('Failed to update profile', 'error');
    } finally { setSaving(false); }
  };

  const role = user?.role ?? 'member';

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Profile" description="Your name as it appears across Ledger, and how the app looks on this device." />

      <Card>
        <CardHeader title="Your details" divider actions={<Pill color={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Pill>} />
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <InitialsAvatar name={displayName || user?.displayName || '?'} color="var(--primary)" size={56} />
            <div className="text-[13px] text-content-3 leading-snug">
              {ROLE_SENTENCE[role]}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Display name">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className={inputCls}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </Field>
            <Field label="Username" hint="Used to sign in. Ask an admin to change it.">
              <input value={user?.username ?? ''} disabled className={`${inputCls} font-mono`} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={!dirty || saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Appearance" divider />
        <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-sm font-bold text-content">Theme</div>
            <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug">Saved on this device. The sidebar toggle switches the same setting.</div>
          </div>
          <SegmentedControl
            value={theme}
            onChange={(v) => { if (v !== theme) toggleTheme(); }}
            options={[
              { value: 'light', label: <span className="inline-flex items-center gap-1.5">{sun}Light</span> },
              { value: 'dark', label: <span className="inline-flex items-center gap-1.5">{moon}Dark</span> },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
