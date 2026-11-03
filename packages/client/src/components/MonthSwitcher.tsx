// Phone period bar: previous/next arrows around a title and a quiet subline.
// Sits at the top of a card; the table below it follows the period it shows.
const arrow = 'w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-content-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent';

export default function MonthSwitcher({ title, subtitle, onPrev, onNext, prevLabel = 'Previous month', nextLabel = 'Next month', prevDisabled, nextDisabled }: {
  title: string;
  subtitle?: string;
  onPrev: () => void;
  onNext: () => void;
  prevLabel?: string;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-2 border-b border-line">
      <button type="button" onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel} className={arrow}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="text-center min-w-0" aria-live="polite">
        <div className="text-[16px] font-extrabold text-content">{title}</div>
        {subtitle && <div className="text-[12px] text-content-3">{subtitle}</div>}
      </div>
      <button type="button" onClick={onNext} disabled={nextDisabled} aria-label={nextLabel} className={arrow}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </div>
  );
}
