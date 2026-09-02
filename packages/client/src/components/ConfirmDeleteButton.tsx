import { useState, useEffect, useCallback } from 'react';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  onFirstClick?: () => void;
  label?: string;
  confirmLabel?: string;
  timeout?: number;
  /** 'pill' = compact footer button (default). 'block' = full-width, for panels. */
  variant?: 'pill' | 'block';
  disabled?: boolean;
}

/** Two-click destructive action: outlined `--negative` at rest, solid while
 *  confirming (auto-resets). Design system destructive button chrome. */
export default function ConfirmDeleteButton({
  onConfirm,
  onFirstClick,
  label = 'Delete',
  confirmLabel = 'Confirm delete?',
  timeout = 3000,
  variant = 'pill',
  disabled = false,
}: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), timeout);
    return () => clearTimeout(t);
  }, [confirming, timeout]);

  const handleClick = useCallback(() => {
    if (!confirming) { setConfirming(true); onFirstClick?.(); return; }
    onConfirm();
    setConfirming(false);
  }, [confirming, onConfirm, onFirstClick]);

  const style = confirming
    ? { border: '1px solid var(--negative)', background: 'var(--negative)', color: 'var(--on-primary)' }
    : { border: '1px solid color-mix(in srgb, var(--negative) 40%, var(--line))', color: 'var(--negative)', background: 'transparent' };

  if (variant === 'block') {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <button type="button" onClick={handleClick} disabled={disabled}
          className="w-full h-11 rounded-[11px] font-bold text-sm cursor-pointer transition-colors disabled:opacity-50" style={style}>
          {confirming ? confirmLabel : label}
        </button>
        {confirming && (
          <button type="button" onClick={() => setConfirming(false)}
            className="h-8 w-full rounded-[10px] bg-transparent border-none cursor-pointer text-[12.5px] font-semibold text-content-2 hover:bg-surface-2">
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={handleClick} disabled={disabled}
        className="h-10 px-4 rounded-[11px] font-bold text-sm cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50" style={style}>
        {confirming ? confirmLabel : label}
      </button>
      {confirming && (
        <button type="button" onClick={() => setConfirming(false)}
          className="h-10 px-3 rounded-[10px] bg-transparent border-none cursor-pointer text-sm font-semibold text-content-2 hover:bg-surface-2">
          Cancel
        </button>
      )}
    </div>
  );
}
