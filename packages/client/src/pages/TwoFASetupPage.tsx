import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import AuthShell from '../components/AuthShell';
import InlineNotification from '../components/InlineNotification';
import TwoFAKeySetup, { WRONG_CODE_MESSAGE, copyText, isWrongCodeError } from '../components/TwoFAKeySetup';
import { btnPrimary, btnSecondary } from '../components/settings/ui';

interface SetupData { qrCodeUrl: string; secret: string; otpauthUri: string }

/** Forced two-factor enrolment (an admin requires it for this role). */
export default function TwoFASetupPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'start' | 'scan' | 'backup'>('start');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (verifyCode.length === 6 && step === 'scan' && !loading) handleVerify({ preventDefault: () => {} } as FormEvent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyCode]);

  const handleStartSetup = async () => {
    setError(''); setLoading(true);
    try {
      const res = await apiFetch<{ data: SetupData }>('/auth/2fa/setup', { method: 'POST' });
      setSetupData(res.data); setStep('scan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start two-factor setup');
    } finally { setLoading(false); }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!setupData) return;
    setError(''); setCodeError(''); setLoading(true);
    try {
      const res = await apiFetch<{ data: { backupCodes: string[] } }>('/auth/2fa/confirm', { method: 'POST', body: JSON.stringify({ token: verifyCode, secret: setupData.secret }) });
      setBackupCodes(res.data.backupCodes); setStep('backup');
      await refreshUser();
    } catch (err) {
      if (isWrongCodeError(err)) setCodeError(WRONG_CODE_MESSAGE);
      else setError(err instanceof Error ? err.message : 'Verification failed');
    } finally { setLoading(false); }
  };

  const downloadBackupCodes = () => {
    const text = `Ledger backup codes\nGenerated: ${new Date().toLocaleDateString()}\nUser: ${user?.username}\n\n${backupCodes.join('\n')}\n\nEach code can only be used once.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ledger-backup-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  if (step === 'backup') {
    return (
      <AuthShell title="Two-factor authentication is on" description="Save these backup codes somewhere safe. Each one signs you in once if you lose access to your authenticator app." maxWidth={440}>
        <div className="flex flex-col gap-4">
          <InlineNotification type="warning" message="These codes won't be shown again." />
          <div className="bg-surface-2 border border-line rounded-[12px] p-4 grid grid-cols-2 gap-1.5">
            {backupCodes.map((code, i) => <code key={i} className="font-mono text-[14px] text-content text-center py-0.5">{code}</code>)}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={async () => { await copyText(backupCodes.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={btnSecondary}>{copied ? 'Copied' : 'Copy all'}</button>
            <button type="button" onClick={downloadBackupCodes} className={btnSecondary}>Download .txt</button>
          </div>
          <button type="button" onClick={() => navigate('/', { replace: true })} className={`${btnPrimary} w-full h-11`}>Continue to Ledger</button>
        </div>
      </AuthShell>
    );
  }

  if (step === 'scan' && setupData) {
    return (
      <AuthShell title="Set up two-factor authentication" description="Your administrator requires a second sign-in step for your account." maxWidth={480}>
        <form onSubmit={handleVerify} className="flex flex-col gap-6">
          {error && <InlineNotification type="error" message={error} />}
          <TwoFAKeySetup qrCodeUrl={setupData.qrCodeUrl} secret={setupData.secret} otpauthUri={setupData.otpauthUri}
            verifyCode={verifyCode} onCodeChange={(v) => { setVerifyCode(v); setCodeError(''); }} codeError={codeError} autoSubmitHint />
          <button type="submit" disabled={loading || verifyCode.length !== 6} className={`${btnPrimary} w-full h-11`}>{loading ? 'Verifying…' : 'Verify and enable'}</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set up two-factor authentication" description="Your administrator requires a second sign-in step for your account.">
      <div className="flex flex-col gap-5">
        {error && <InlineNotification type="error" message={error} />}
        <p className="text-sm text-content-2 m-0 leading-relaxed">
          You'll need an authenticator app such as 1Password, Google Authenticator, or Authy. Ledger gives you a setup key and QR code to add it, then asks for the 6-digit code the app generates.
        </p>
        <button type="button" onClick={handleStartSetup} disabled={loading} className={`${btnPrimary} w-full h-11`}>{loading ? 'Starting…' : 'Get started'}</button>
      </div>
    </AuthShell>
  );
}
