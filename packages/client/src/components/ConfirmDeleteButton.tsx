import { useState, useEffect, useCallback } from 'react';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  onFirstClick?: () => void;
  label?: string;
  confirmLabel?: string;
  timeout?: number;
  /** 'pill' = compact footer button (default). 'block' = full-width, for panels. */
  variant?: 'pill' | 'block';
}

export default function ConfirmDeleteButton({
  onConfirm,
  onFirstClick,
  label = 'Delete',
  confirmLabel = 'Confirm Delete?',
  timeout = 3000,
  variant = 'pill',
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

  if (variant === 'block') {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <button
          onClick={handleClick}
          className="w-full h-11 rounded-[11px] font-bold text-sm cursor-pointer transition-colors"
          style={confirming
            ? { border: '1px solid var(--negative)', background: 'var(--negative)', color: '#fff' }
            : { border: '1px solid color-mix(in srgb, var(--negative) 40%, var(--line))', color: 'var(--negative)', background: 'transparent' }}
        >
          {confirming ? confirmLabel : label}
        </button>
        {confirming && (
          <button
            onClick={() => setConfirming(false)}
            className="h-8 w-full rounded-[10px] bg-transparent border-none cursor-pointer text-[12.5px] font-semibold text-content-2 hover:bg-surface-2"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        className={`px-4 py-2 text-[12px] font-semibold rounded-lg border-none cursor-pointer ${
          confirming ? 'bg-[var(--btn-destructive-bg)] text-[var(--btn-destructive-text)] btn-destructive' : 'bg-[var(--btn-destructive-light-bg)] text-[var(--btn-destructive-light-text)] btn-destructive-light'
        }`}
      >
        {confirming ? confirmLabel : label}
      </button>
      {confirming && (
        <button
          onClick={() => setConfirming(false)}
          className="text-[12px] text-[var(--text-secondary)] bg-transparent border-none cursor-pointer underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
