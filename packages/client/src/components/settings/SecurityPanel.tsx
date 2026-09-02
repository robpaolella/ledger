import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import InlineNotification from '../InlineNotification';
import ResponsiveModal from '../ResponsiveModal';
import TotpCodeInput from '../TotpCodeInput';
import Tooltip from '../Tooltip';
import { Card, CardHeader, Field, PanelHeader, Pill, inputCls, btnPrimary, btnSecondary, btnDanger } from './ui';

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    // Clipboard API can be blocked inside modals — fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}

type Step = 'idle' | 'scan' | 'backup' | 'disable' | 'regenerate';

/** Settings → Security: password + two-factor authentication. */
export default function SecurityPanel() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();

  // password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // 2FA
  const [twofaEnabled, setTwofaEnabled] = useState(!!user?.twofaEnabled);
  const [step, setStep] = useState<Step>('idle');
  const [setupData, setSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const changePassword = async () => {
    setPwError('');
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    setPwLoading(true);
    try {
      await apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
      addToast('Password changed');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password');
    } finally { setPwLoading(false); }
  };
  const pwReady = currentPassword && newPassword && confirmPassword;

  const closeModal = () => { setStep('idle'); setSetupData(null); setVerifyCode(''); setShowSecret(false); setSecretCopied(false); setPassword(''); setError(''); };

  const startSetup = async () => {
    setError(''); setBusy(true);
    try {
      const res = await apiFetch<{ data: { qrCodeUrl: string; secret: string } }>('/auth/2fa/setup', { method: 'POST' });
      setSetupData(res.data); setStep('scan');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to start setup', 'error');
    } finally { setBusy(false); }
  };

  const confirmSetup = async () => {
    if (!setupData) return;
    setError(''); setBusy(true);
    try {
      const res = await apiFetch<{ data: { backupCodes: string[] } }>('/auth/2fa/confirm', { method: 'POST', body: JSON.stringify({ token: verifyCode, secret: setupData.secret }) });
      setBackupCodes(res.data.backupCodes); setTwofaEnabled(true); setStep('backup'); setVerifyCode('');
      await refreshUser();
      addToast('Two-factor authentication enabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setError(''); setBusy(true);
    try {
      await apiFetch('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ password }) });
      setTwofaEnabled(false); closeModal();
      await refreshUser();
      addToast('Two-factor authentication disabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable two-factor authentication');
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    setError(''); setBusy(true);
    try {
      const res = await apiFetch<{ data: { backupCodes: string[] } }>('/auth/2fa/regenerate-backup-codes', { method: 'POST', body: JSON.stringify({ password }) });
      setBackupCodes(res.data.backupCodes); setStep('backup'); setPassword('');
      addToast('Backup codes regenerated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate codes');
    } finally { setBusy(false); }
  };

  const modalTitle: Record<Step, string> = { idle: '', scan: 'Set up two-factor authentication', backup: 'Save your backup codes', disable: 'Disable two-factor authentication', regenerate: 'Regenerate backup codes' };
  const modalFooter =
    step === 'scan' ? (
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={confirmSetup} disabled={busy || verifyCode.length !== 6} className={btnPrimary}>{busy ? 'Verifying…' : 'Verify and enable'}</button>
      </div>
    ) : step === 'backup' ? (
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={async () => { await copyText(backupCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={btnSecondary}>{copied ? 'Copied' : 'Copy all'}</button>
        <button type="button" onClick={closeModal} className={btnPrimary}>Done</button>
      </div>
    ) : step === 'disable' ? (
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={disable} disabled={busy || !password} className={`${btnPrimary} bg-negative hover:bg-negative`}>{busy ? 'Disabling…' : 'Disable'}</button>
      </div>
    ) : step === 'regenerate' ? (
      <div className="flex justify-end gap-2.5">
        <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
        <button type="button" onClick={regenerate} disabled={busy || !password} className={btnPrimary}>{busy ? 'Regenerating…' : 'Regenerate'}</button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-[22px]">
      <PanelHeader title="Security" description="Your password and the second factor that protects sign-in." />

      <Card>
        <CardHeader title="Password" divider />
        <div className="px-6 py-5 flex flex-col gap-4">
          {pwError && <InlineNotification type="error" message={pwError} dismissible onDismiss={() => setPwError('')} />}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Current password">
              <input type="password" value={currentPassword} autoComplete="current-password" onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input type="password" value={newPassword} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Confirm new password">
              <input type="password" value={confirmPassword} autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls}
                onKeyDown={(e) => { if (e.key === 'Enter' && pwReady) changePassword(); }} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={changePassword} disabled={!pwReady || pwLoading} className={btnPrimary}>{pwLoading ? 'Changing…' : 'Change password'}</button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Two-factor authentication" divider
          actions={twofaEnabled ? <Pill color="var(--positive)">Enabled</Pill> : <Pill color="var(--text-3)">Off</Pill>} />
        <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0 max-w-[520px]">
            <div className="text-sm font-bold text-content">{twofaEnabled ? 'Your account asks for a code at sign-in' : 'Add a second step to sign-in'}</div>
            <div className="text-[12.5px] text-content-3 mt-0.5 leading-snug">
              {twofaEnabled
                ? 'Use your authenticator app, or one of your single-use backup codes if you lose the device.'
                : 'Scan a QR code with an authenticator app (1Password, Google Authenticator, Authy…) and enter the 6-digit code it shows.'}
            </div>
          </div>
          {twofaEnabled ? (
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => { setStep('regenerate'); setPassword(''); setError(''); }} className={btnSecondary}>Regenerate backup codes</button>
              <button type="button" onClick={() => { setStep('disable'); setPassword(''); setError(''); }} className={btnDanger}>Disable</button>
            </div>
          ) : (
            <button type="button" onClick={startSetup} disabled={busy} className={btnPrimary}>{busy ? 'Starting…' : 'Enable two-factor'}</button>
          )}
        </div>
      </Card>

      <ResponsiveModal isOpen={step !== 'idle'} onClose={closeModal} title={modalTitle[step]} maxWidth="440px" footer={modalFooter}>
        {error && <InlineNotification type="error" message={error} dismissible onDismiss={() => setError('')} className="mb-4" />}

        {step === 'scan' && setupData && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-content-2 m-0 leading-snug">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-[12px]"><img src={setupData.qrCodeUrl} alt="Two-factor QR code" className="w-40 h-40 block" /></div>
            </div>
            <button type="button" onClick={() => setShowSecret((v) => !v)} className="text-[13px] font-semibold text-primary w-full text-center">
              {showSecret ? 'Hide secret key' : "Can't scan? Enter the key manually"}
            </button>
            {showSecret && (
              <div className="flex justify-center">
                <Tooltip content={secretCopied ? 'Copied to clipboard' : 'Click to copy'}>
                  <button type="button" onClick={async () => { await copyText(setupData.secret); setSecretCopied(true); setTimeout(() => setSecretCopied(false), 2000); }}
                    className="bg-surface-2 border border-line-strong rounded-[11px] px-4 py-2.5 hover:border-primary transition-colors">
                    <code className="font-mono text-[12px] text-content break-all">{setupData.secret}</code>
                  </button>
                </Tooltip>
              </div>
            )}
            <TotpCodeInput value={verifyCode} onChange={setVerifyCode} autoFocus />
          </div>
        )}

        {step === 'backup' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-content-2 m-0 leading-snug">Each backup code signs you in once if you can't reach your authenticator app.</p>
            <InlineNotification type="warning" message="These codes won't be shown again — store them somewhere safe." />
            <div className="bg-surface-2 border border-line rounded-[12px] p-4 grid grid-cols-2 gap-1.5">
              {backupCodes.map((code, i) => <code key={i} className="font-mono text-[13px] text-content text-center py-0.5">{code}</code>)}
            </div>
          </div>
        )}

        {(step === 'disable' || step === 'regenerate') && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-content-2 m-0 leading-snug">
              {step === 'disable' ? 'Enter your password to turn off two-factor authentication.' : 'Enter your password to issue a new set of backup codes. Your previous codes stop working.'}
            </p>
            <Field label="Password">
              <input type="password" value={password} autoComplete="current-password" autoFocus onChange={(e) => setPassword(e.target.value)} className={inputCls}
                onKeyDown={(e) => { if (e.key === 'Enter' && password) (step === 'disable' ? disable : regenerate)(); }} />
            </Field>
          </div>
        )}
      </ResponsiveModal>
    </div>
  );
}
