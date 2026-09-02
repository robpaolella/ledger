import { useState, useEffect, type FormEvent } from 'react';
import LedgerLogo from '../components/LedgerLogo';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import InlineNotification from '../components/InlineNotification';
import TotpCodeInput from '../components/TotpCodeInput';

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
      setError(err instanceof Error ? err.message : 'Login failed');
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
      // Try to extract attemptsRemaining from the error
      if (message.includes('Invalid verification code')) {
        setAttemptsRemaining(prev => prev !== null ? prev - 1 : 4);
      }
      if (message.includes('Too many attempts')) {
        // Reset to login
        setNeeds2FA(false);
        setTempToken('');
        setTotpCode('');
        setBackupCode('');
        setAttemptsRemaining(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (totpCode.length === 6 && !useBackupCode && needs2FA && !loading) {
      const fakeEvent = { preventDefault: () => {} } as FormEvent;
      handle2FAVerify(fakeEvent);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totpCode]);

  // Already logged in — redirect to dashboard (declaratively: calling
  // navigate() during render is a React error, not a redirect).
  if (user) {
    return <Navigate to="/" replace />;
  }

  if (needs2FA) {
    return (
      <div className="min-h-screen bg-[var(--bg-sidebar)] flex items-center justify-center font-sans">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <LedgerLogo size={40} />
            <span className="text-gray-100 text-2xl font-bold tracking-tight">Ledger</span>
          </div>

          <form
            onSubmit={handle2FAVerify}
            className="bg-[var(--bg-card)] rounded-xl p-8 shadow-lg"
          >
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Two-Factor Authentication</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              {useBackupCode
                ? 'Enter one of your backup codes'
                : 'Enter the 6-digit code from your authenticator app'}
            </p>

            {error && (
              <InlineNotification type="error" message={error} className="mb-4" />
            )}

            {attemptsRemaining !== null && attemptsRemaining > 0 && (
              <p className="text-xs text-[var(--text-muted)] mb-4">
                {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining
              </p>
            )}

            {useBackupCode ? (
              <div className="mb-6">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Backup Code
                </label>
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2.5 border border-[var(--bg-input-border)] rounded-lg text-sm bg-[var(--bg-input)] text-[var(--text-primary)] outline-none font-mono text-center tracking-widest"
                  placeholder="XXXX-XXXX"
                  required
                  autoCapitalize="off"
                  autoComplete="off"
                />
              </div>
            ) : (
              <div className="mb-6">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
                  Verification Code
                </label>
                <TotpCodeInput
                  value={totpCode}
                  onChange={setTotpCode}
                  autoFocus={needs2FA && !useBackupCode}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-sm font-semibold btn-primary transition-colors disabled:opacity-60 mb-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying...
                </span>
              ) : (
                'Verify'
              )}
            </button>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode(!useBackupCode);
                  setError('');
                  setTotpCode('');
                  setBackupCode('');
                }}
                className="text-xs text-[var(--color-accent)] hover:underline bg-transparent border-none cursor-pointer"
              >
                {useBackupCode ? 'Use authenticator app' : 'Use a backup code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setNeeds2FA(false);
                  setTempToken('');
                  setTotpCode('');
                  setBackupCode('');
                  setError('');
                  setAttemptsRemaining(null);
                }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent border-none cursor-pointer"
              >
                ← Back to login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-sidebar)] flex items-center justify-center font-sans">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <LedgerLogo size={40} />
          <span className="text-gray-100 text-2xl font-bold tracking-tight">Ledger</span>
        </div>

        {/* Form Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-[var(--bg-card)] rounded-xl p-8 shadow-lg"
        >
          <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">Sign in</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">Enter your credentials to continue</p>

          {error && (
            <InlineNotification type="error" message={error} className="mb-4" />
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--bg-input-border)] rounded-lg text-sm bg-[var(--bg-input)] text-[var(--text-primary)] outline-none"
              placeholder="Enter username"
              required
              autoFocus
              autoCapitalize="off"
              autoComplete="username"
            />
          </div>

          <div className="mb-6">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-[var(--bg-input-border)] rounded-lg text-sm bg-[var(--bg-input)] text-[var(--text-primary)] outline-none"
              placeholder="Enter password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-lg text-sm font-semibold btn-primary transition-colors disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
