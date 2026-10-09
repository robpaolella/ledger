import type { ReactNode } from 'react';
import { VendorAvatar } from './primitives';

/**
 * Two-line list row — the one row anatomy for transaction-like lists on phones
 * (and anywhere a table would not fit): avatar · title + subtitle · amount + meta.
 * 64px tall, 16px side padding, hairline between rows.
 */
export function ListRow({
  avatar, title, titleExtra, subtitle, amount, amountClass = '', meta, onClick, chevron = false, className = '', leading, rowId,
}: {
  avatar?: { name: string; src?: string | null; color?: string; size?: number };
  /** Custom leading element instead of an avatar (e.g. a category emoji tile). */
  leading?: ReactNode;
  title: ReactNode;
  titleExtra?: ReactNode;
  subtitle?: ReactNode;
  amount?: ReactNode;
  amountClass?: string;
  meta?: ReactNode;
  onClick?: () => void;
  /** Stable id, so a page can return keyboard focus to this row (data-row-id). */
  rowId?: string;
  chevron?: boolean;
  className?: string;
}) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      data-row-id={rowId}
      // Enter / Space act like a click, but only when the row itself has focus.
      onKeyDown={clickable ? (e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault(); // Space must not scroll the page
        onClick();
      } : undefined}
      className={`flex items-center gap-3 px-4 min-h-16 py-2.5 border-t border-line first:border-t-0 ${clickable ? 'cursor-pointer active:bg-surface-2 hover:bg-surface-2/40 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring' : ''} ${className}`}
    >
      {leading ?? (avatar && <VendorAvatar name={avatar.name} src={avatar.src || undefined} color={avatar.color} size={avatar.size ?? 36} />)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[15px] font-semibold text-content truncate">{title}</span>
          {titleExtra}
        </div>
        {subtitle && <div className="flex items-center gap-1.5 text-[12.5px] text-content-3 min-w-0 mt-0.5 [&>*]:min-w-0">{subtitle}</div>}
      </div>
      {(amount != null || meta) && (
        <div className="text-right shrink-0 max-w-[52%]">
          {amount != null && <div className={`text-[15px] font-bold tabular-nums ${amountClass}`}>{amount}</div>}
          {meta && <div className="text-[11.5px] text-content-3 mt-0.5 truncate">{meta}</div>}
        </div>
      )}
      {chevron && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2" className="shrink-0 -mr-1"><path d="m9 6 6 6-6 6" /></svg>}
    </div>
  );
}

/** Colored category dot + name, for row subtitles. */
export function CategoryTag({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color ?? 'var(--text-3)' }} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Day / section divider bar used above grouped rows (same on desktop and phones). */
export function GroupHeader({ label, right, rightClass = 'text-content-3', className = '' }: { label: ReactNode; right?: ReactNode; rightClass?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 md:px-6 py-2 md:py-2.5 bg-surface-2 border-t border-b border-line ${className}`}>
      <span className="text-[13px] font-semibold text-content-2 truncate">{label}</span>
      {right != null && <span className={`font-mono text-xs tabular-nums shrink-0 ${rightClass}`}>{right}</span>}
    </div>
  );
}
