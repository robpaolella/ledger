import type { ReactNode } from 'react';
import LedgerLogo from './LedgerLogo';

/**
 * Full-screen frame for the signed-out pages (sign in, first-run setup,
 * forced two-factor setup): the brand backdrop, the logo lockup, and one
 * elevated card with the design-system header anatomy.
 */
export default function AuthShell({ title, description, children, maxWidth = 400 }: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center font-sans px-4 py-10" style={{ background: 'var(--bg-sidebar)' }}>
      <div className="w-full" style={{ maxWidth }}>
        <div className="flex items-center justify-center gap-3 mb-8">
          <LedgerLogo size={40} />
          <span className="text-[26px] font-extrabold tracking-tight" style={{ color: 'var(--sidebar-text)' }}>Ledger</span>
        </div>
        <div className="bg-surface border border-line rounded-[18px] shadow-md overflow-hidden">
          <div className="px-7 pt-6 pb-5 border-b border-line">
            <h1 className="text-[20px] font-extrabold tracking-tight text-content m-0 leading-tight">{title}</h1>
            {description && <p className="text-sm text-content-3 mt-1.5 m-0 leading-snug">{description}</p>}
          </div>
          <div className="px-7 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
