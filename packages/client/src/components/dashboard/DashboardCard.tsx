/**
 * Shared dashboard card chrome per designs/Dashboard.dc.html: 16px radius,
 * 22/24/18 header, full-width border-t section dividers, edge-to-edge rows.
 * The header doubles as the drag region when `dragHandleProps` is supplied;
 * header-right controls stop pointerdown propagation so they never start a drag.
 */
import type { HTMLAttributes, ReactNode } from 'react';

interface Props {
  /** Plain title variant (Budget, Spending, Transactions, Recurring, Reviews). */
  title?: string;
  /** Muted inline subtitle on the title baseline. Cards style their own span. */
  subtitle?: ReactNode;
  /** Headline-in-header variant (Net worth, Investments) — replaces title. */
  headline?: ReactNode;
  /** Dropdown-style control slot (never part of the drag region). */
  headerRight?: ReactNode;
  /** useSortable attributes+listeners, spread on the header. */
  dragHandleProps?: HTMLAttributes<HTMLDivElement>;
  children: ReactNode;
}

export default function DashboardCard({ title, subtitle, headline, headerRight, dragHandleProps, children }: Props) {
  return (
    <div className="rounded-[16px] border border-line bg-surface shadow-sm overflow-hidden">
      <div
        {...dragHandleProps}
        className={`flex items-center justify-between gap-4 px-6 pt-[22px] pb-[18px] select-none ${dragHandleProps ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
      >
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
          {headline ?? (
            <>
              <span className="text-[20px] font-extrabold tracking-[-0.01em]">{title}</span>
              {subtitle}
            </>
          )}
        </div>
        {headerRight && (
          <div className="flex-none" onPointerDown={(e) => e.stopPropagation()}>
            {headerRight}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** Edge-to-edge card section with the full-width top divider. */
export function CardSection({ className = 'px-6 py-[22px]', children }: { className?: string; children: ReactNode }) {
  return <div className={`border-t border-line ${className}`}>{children}</div>;
}

/** Dropdown-style header control (design's pill with a chevron-down). */
export function CardHeaderControl({
  children, onClick, small = false,
}: { children: ReactNode; onClick?: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between bg-surface-2 border border-line text-content font-semibold whitespace-nowrap cursor-pointer ${
        small ? 'h-[38px] px-[13px] gap-2.5 rounded-[10px] text-[13px]' : 'h-10 px-3.5 gap-3 rounded-[11px] text-sm'
      }`}
    >
      {children}
      <svg width={small ? 15 : 16} height={small ? 15 : 16} viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

/** Simple pulse skeleton for a loading card body. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <CardSection>
      <div className="animate-pulse flex flex-col gap-3">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 rounded-md bg-surface-2" style={{ width: `${80 - i * 18}%` }} />
        ))}
      </div>
    </CardSection>
  );
}

/** Inline fetch-failure line. */
export function CardError({ message }: { message: string }) {
  return <CardSection className="px-6 py-[22px] text-sm text-content-3">{message}</CardSection>;
}
