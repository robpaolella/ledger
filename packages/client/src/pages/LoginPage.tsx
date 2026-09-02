import { useState, useEffect, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';
import InlineNotification from '../components/InlineNotification';
import Spinner from '../components/Spinner';
import TotpCodeInput from '../components/TotpCodeInput';
import { Field, inputCls, btnPrimary } from '../components/settings/ui';

export default function LoginPage() {
  const { login, verify2FA, user } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.requiresTwoFA && result.tempToken) {
        setNeeds2FA(true);
        setTempToken(result.tempToken);
        setLoading(false);
        return;
      }
      if (result.twofaSetupRequired) {
        navigate('/setup-2fa', { replace: true });
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FAVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const code = useBackupCode ? backupCode : totpCode;
      await verify2FA(tempToken, code, useBackupCode);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
      if (message.includes('Invalid verification code')) {
        setAttemptsRemaining((prev) => (prev !== null ? prev - 1 : 4));
        setTotpCode('');
      }
      if (message.includes('Too many attempts')) {
        setNeeds2FA(false); setTempToken(''); setTotpCode(''); setBackupCode(''); setAttemptsRemaining(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (totpCode.length === 6 && !useBackupCode && needs2FA && !loading) {
      handle2FAVerify({ preventDefault: () => {} } as FormEvent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode]);

  // Already signed in — redirect declaratively (navigate() during render is a React error).
  if (user) return <Navigate to="/" replace />;

  const backToLogin = () => { setNeeds2FA(false); setTempToken(''); setTotpCode(''); setBackupCode(''); setError(''); setAttemptsRemaining(null); };

  if (needs2FA) {
    return (
      <AuthShell title="Two-factor authentication" description={useBackupCode ? 'Enter one of your single-use backup codes.' : 'Enter the 6-digit code from your authenticator app.'}>
        <form onSubmit={handle2FAVerify} className="flex flex-col gap-5">
          {error && <InlineNotification type="error" message={error} />}
          {attemptsRemaining !== null && attemptsRemaining > 0 && (
            <div className="text-[13px] text-content-3 -mt-2">{attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining</div>
          )}
          {useBackupCode ? (
            <Field label="Backup code">
              <input type="text" value={backupCode} onChange={(e) => setBackupCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" required autoFocus autoCapitalize="off" autoComplete="off"
                className={`${inputCls} font-mono text-center tracking-widest`} />
            </Field>
          ) : (
            <Field label={<span className="block text-center">Verification code</span>}>
              <TotpCodeInput value={totpCode} onChange={setTotpCode} autoFocus={needs2FA && !useBackupCode} />
            </Field>
          )}
          <button type="submit" disabled={loading || (useBackupCode ? !backupCode : totpCode.length !== 6)} className={`${btnPrimary} w-full h-11`}>
            {loading ? <><Spinner inline size={16} className="border-on-primary/40 border-t-on-primary" /> Verifying…</> : 'Verify'}
          </button>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => { setUseBackupCode(!useBackupCode); setError(''); setTotpCode(''); setBackupCode(''); }} className="text-[13px] font-semibold text-primary">
              {useBackupCode ? 'Use authenticator app' : 'Use a backup code'}
            </button>
            <button type="button" onClick={backToLogin} className="text-[13px] font-semibold text-content-3 hover:text-content">Back to sign in</button>
          </div>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" description="Enter your credentials to continue.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <InlineNotification type="error" message={error} />}
        <Field label="Username">
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required autoFocus autoCapitalize="off" autoComplete="username" className={inputCls} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" className={inputCls} />
        </Field>
        <button type="submit" disabled={loading} className={`${btnPrimary} w-full h-11 mt-1`}>
          {loading ? <><Spinner inline size={16} className="border-on-primary/40 border-t-on-primary" /> Signing in…</> : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
