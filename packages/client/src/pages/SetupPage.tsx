import { useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api';
import AuthShell from '../components/AuthShell';
import InlineNotification from '../components/InlineNotification';
import Spinner from '../components/Spinner';
import { Field, inputCls, btnPrimary } from '../components/settings/ui';

/** First-run: create the owner account. Shown until a user exists. */
export default function SetupPage() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^[a-z0-9]{3,20}$/.test(username)) { setError('Username must be 3–20 lowercase letters or numbers'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { token: string } }>('/setup/create-admin', {
        method: 'POST',
        body: JSON.stringify({ username, password, displayName: displayName.trim() }),
        skipAuth: true,
      });
      localStorage.setItem('token', res.data.token);
      // App.tsx decides between the setup route and the app at boot from
      // /setup/status, so a full reload is the way into the signed-in shell.
      window.location.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome to Ledger" description="Create the owner account to get started. You can add household members later in Settings.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error && <InlineNotification type="error" message={error} />}
        <Field label="Your name">
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Full name" required autoFocus className={inputCls} />
        </Field>
        <Field label="Username" hint="Lowercase letters and numbers only, 3–20 characters.">
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} placeholder="username" required autoCapitalize="off" autoComplete="username" className={`${inputCls} font-mono`} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Password" hint="At least 8 characters.">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className={inputCls} />
          </Field>
          <Field label="Confirm password">
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className={inputCls} />
          </Field>
        </div>
        <button type="submit" disabled={loading} className={`${btnPrimary} w-full h-11 mt-1`}>
          {loading ? <><Spinner inline size={16} className="border-on-primary/40 border-t-on-primary" /> Creating account…</> : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
