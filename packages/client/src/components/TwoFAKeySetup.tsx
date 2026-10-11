import { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { btnPrimary, btnSecondarySm } from './settings/ui';
import TotpCodeInput from './TotpCodeInput';

/** Shown under the code boxes when the server rejects a code. */
export const WRONG_CODE_MESSAGE = "That code didn't work. Try the newest one.";

/** True when an error from `/auth/2fa/confirm` means the code itself was wrong. */
export const isWrongCodeError = (err: unknown) =>
  err instanceof Error && err.message.startsWith('Invalid verification code');

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    // Clipboard API can be blocked inside modals — fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }
}

interface TwoFAKeySetupProps {
  qrCodeUrl: string;
  secret: string;
  otpauthUri: string;
  verifyCode: string;
  onCodeChange: (value: string) => void;
  /** Wrong-code message shown under the code boxes. */
  codeError?: string;
  /** Required-setup page: tell the visitor the code is checked automatically. */
  autoSubmitHint?: boolean;
}

const stepCls = 'text-[13px] font-bold text-content mb-2.5';

/**
 * Two-step sign-in setup body, shared by Settings → Security and the required-setup
 * page. Phones lead with "Add to authenticator app" and the setup key (a phone can't
 * scan a QR code from its own screen); desktop leads with the QR code.
 */
export default function TwoFAKeySetup({ qrCodeUrl, secret, otpauthUri, verifyCode, onCodeChange, codeError = '', autoSubmitHint = false }: TwoFAKeySetupProps) {
  const isMobile = useIsMobile();
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const spacedSecret = secret.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ');
  const copy = async () => { await copyText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const keyRow = (
    <div className="flex items-start gap-2">
      <code className="flex-1 min-w-0 min-h-11 px-3.5 py-2.5 rounded-[11px] bg-surface-2 border border-line-strong flex items-center font-mono text-[14px] leading-[1.5] tracking-[0.06em] text-content">{spacedSecret}</code>
      <button type="button" onClick={copy} className={`${btnSecondarySm} h-11! shrink-0`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );

  const qrImg = (size: string) => (
    <div className="bg-white p-3 rounded-[12px] border border-line shrink-0"><img src={qrCodeUrl} alt="Two-factor QR code" className={`${size} block`} /></div>
  );

  return (
    <div className="flex flex-col gap-6">
      {isMobile ? (
        <div>
          <div className={stepCls}>1. Add Ledger to your authenticator app</div>
          <a href={otpauthUri} className={`${btnPrimary} h-11! w-full no-underline`}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14 9l2 2" /></svg>Add to authenticator app</a>
          <div className="text-[12px] text-content-3 mt-2 text-center">No app opened? Copy the setup key below instead.</div>
          <div className="mt-4">
            <div className="text-[13px] font-semibold text-content-2 mb-2">Or copy the setup key</div>
            {keyRow}
          </div>
          <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}
            className="mt-3 w-full h-11 rounded-[11px] text-[13px] font-semibold text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring inline-flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17 17v3h3" /></svg>
            {showQr ? 'Hide QR code' : 'Show QR code (to scan from another device)'}
          </button>
          {showQr && (
            <div className="flex flex-col items-center gap-2 pt-1">
              {qrImg('w-44 h-44')}
              <div className="text-[12px] text-content-3 text-center">Scan this from another device's authenticator app.</div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className={stepCls}>1. Scan this QR code with your authenticator app</div>
          <div className="flex items-start gap-5">
            {qrImg('w-32 h-32')}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-content-3 mb-2">Can't scan it? Enter this setup key instead.</div>
              {keyRow}
            </div>
          </div>
        </div>
      )}

      <div>
        <div className={stepCls}>2. Enter the 6-digit code from the app</div>
        <TotpCodeInput value={verifyCode} onChange={onCodeChange} invalid={!!codeError} alignStart autoFocus={!isMobile} />
        {codeError && <div role="alert" className="text-[13px] font-semibold mt-2 text-negative text-center md:text-left">{codeError}</div>}
        {autoSubmitHint && !codeError && <div className="text-[12px] text-content-3 mt-2 text-center md:text-left">Ledger checks the code as soon as all six digits are in.</div>}
      </div>
    </div>
  );
}
