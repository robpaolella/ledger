interface InlineNotificationProps {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Buttons shown inside the notice, after the message. */
  actions?: React.ReactNode;
  className?: string;
}

const TONE: Record<InlineNotificationProps['type'], string> = {
  success: 'var(--positive)',
  error: 'var(--negative)',
  warning: 'var(--warning)',
  info: 'var(--primary)',
};

const ICON: Record<InlineNotificationProps['type'], React.ReactNode> = {
  success: <path d="M4 12l5 5L20 6" />,
  error: <path d="M12 8v5M12 16.5h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  warning: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  info: <path d="M12 16v-4M12 8h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" />,
};

/** Tinted callout (design system: color-mix 12% fill, 35% border, solid text). */
export default function InlineNotification({ type, message, dismissible, onDismiss, actions, className = '' }: InlineNotificationProps) {
  const tone = TONE[type];
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 ${actions ? 'flex-wrap' : ''} rounded-[12px] border px-4 py-3 text-[13px] font-medium leading-snug ${className}`}
      style={{
        background: `color-mix(in srgb, ${tone} 12%, var(--surface))`,
        borderColor: `color-mix(in srgb, ${tone} 35%, transparent)`,
        color: tone,
      }}
    >
      <svg className="shrink-0 mt-[1px]" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{ICON[type]}</svg>
      <span className={`flex-1 ${actions ? 'min-w-[160px]' : 'min-w-0'}`}>{message}</span>
      {actions && <span className="ml-auto">{actions}</span>}
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 -mr-1 -my-0.5 w-6 h-6 flex items-center justify-center rounded-[6px] text-current opacity-70 hover:opacity-100"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      )}
    </div>
  );
}
