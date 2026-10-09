import { useEffect, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useIsMobile } from '../hooks/useIsMobile';

/** DOM ids of the phone app bar's slots (rendered by MobileHeader). */
export const MOBILE_BAR_SLOTS = { back: 'mobile-bar-back', title: 'mobile-bar-title', actions: 'mobile-bar-actions' } as const;

function useSlot(id: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById(id)); }, [id]);
  return el;
}

/**
 * Phones only: puts the page's title, contextual actions and (optionally) a back
 * link into the app bar, the way a native app does. Renders nothing on desktop.
 */
export function MobileBar({ title, actions, back }: { title?: ReactNode; actions?: ReactNode; back?: string }) {
  const isMobile = useIsMobile();
  const titleEl = useSlot(MOBILE_BAR_SLOTS.title);
  const actionsEl = useSlot(MOBILE_BAR_SLOTS.actions);
  const backEl = useSlot(MOBILE_BAR_SLOTS.back);
  if (!isMobile) return null;
  return (
    <>
      {title != null && titleEl && createPortal(
        <span className="block truncate text-[17px] font-extrabold tracking-tight text-content">{title}</span>, titleEl)}
      {actions && actionsEl && createPortal(<>{actions}</>, actionsEl)}
      {back && backEl && createPortal(
        <Link to={back} aria-label="Back" className="w-10 h-10 rounded-[10px] flex items-center justify-center text-content-2 active:bg-surface-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Link>, backEl)}
    </>
  );
}

/**
 * Sticky page header shared by every primary page.
 *
 * Desktop: one row — title cluster left, controls right (unchanged recipe).
 * Phones: the title moves into the app bar (see MobileBar); the header itself
 * only renders when there is something else to show — tabs (`left`) and/or a
 * toolbar (`right`) — each on its own wrapping row, pinned under the app bar.
 */
export default function PageHeader({
  title, subtitle, left, right, mobileTitle, mobileActions, mobileBack, className = '', headerRef, stackRight = true,
}: {
  /** Page title. A string doubles as the phone app-bar title unless `mobileTitle` is given. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Extra title-row content (tabs, status pill). Shown on phones as a toolbar row. */
  left?: ReactNode;
  /** Controls (desktop: right of the title; phones: a wrapping toolbar row). */
  right?: ReactNode;
  mobileTitle?: ReactNode;
  /** Contextual icon buttons for the phone app bar. */
  mobileActions?: ReactNode;
  /** Route for a back link in the phone app bar (replaces menu + bell). */
  mobileBack?: string;
  className?: string;
  headerRef?: Ref<HTMLDivElement>;
  /** false keeps the controls beside the title on phones (one or two small buttons). */
  stackRight?: boolean;
}) {
  const isMobile = useIsMobile();
  const barTitle = mobileTitle ?? (typeof title === 'string' ? title : undefined);
  const showHeader = !isMobile || !!left || !!right;
  const stacked = stackRight && right && (left || !isMobile);
  return (
    <>
      <MobileBar title={barTitle} actions={mobileActions} back={mobileBack} />
      {showHeader && (
        <div
          ref={headerRef}
          className={`sticky top-14 md:top-0 z-20 -mt-4 md:-mt-7 -mx-4 md:-mx-8 px-4 md:px-8 py-3 md:py-4 mb-5 md:mb-6 bg-bg border-b border-line flex ${
            stacked ? 'flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4' : 'items-center justify-between gap-3 md:gap-4'
          } ${className}`}
        >
          {(!isMobile || left) && (
            <div className="flex items-center gap-3 md:gap-6 min-w-0 md:shrink-0">
              {!isMobile && title != null && <PageTitle subtitle={subtitle}>{title}</PageTitle>}
              {left}
            </div>
          )}
          {right && (
            <div className={`flex items-center gap-2 md:gap-2.5 flex-wrap w-full md:w-auto ${stacked ? '' : 'shrink-0 justify-end'} md:justify-end [&>*]:shrink-0`}>
              {right}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Title cluster: 22px title + optional muted subtitle. */
export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 min-w-0">
      <h1 className="page-title text-[22px] font-extrabold text-content tracking-tight leading-tight m-0 truncate">{children}</h1>
      {subtitle && <p className="page-subtitle text-content-3 text-[13px] m-0 whitespace-nowrap">{subtitle}</p>}
    </div>
  );
}
