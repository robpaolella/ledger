import { useRef, useEffect, useCallback, type ClipboardEvent, type KeyboardEvent, type ChangeEvent } from 'react';

interface TotpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** Six-box one-time-code input (auto-advance, paste, backspace). */
export default function TotpCodeInput({ value, onChange, autoFocus = false, disabled = false }: TotpCodeInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, '').slice(0, 6).split('');

  const focusInput = useCallback((index: number) => {
    if (index >= 0 && index < 6) {
      inputRefs.current[index]?.focus();
      inputRefs.current[index]?.select();
    }
  }, []);

  useEffect(() => {
    if (autoFocus) {
      // Small delay to ensure DOM is ready (especially in bottom sheets)
      const timer = setTimeout(() => focusInput(0), 50);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, focusInput]);

  const updateValue = useCallback((newDigits: string[]) => {
    onChange(newDigits.join('').replace(/\D/g, '').slice(0, 6));
  }, [onChange]);

  const handleChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, '');
    if (!input) return;
    if (input.length > 1) {
      const newDigits = [...digits];
      for (let i = 0; i < input.length && index + i < 6; i++) newDigits[index + i] = input[i];
      updateValue(newDigits);
      focusInput(Math.min(index + input.length, 5));
      return;
    }
    const newDigits = [...digits];
    newDigits[index] = input[0];
    updateValue(newDigits);
    if (index < 5) focusInput(index + 1);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const newDigits = [...digits];
      if (digits[index] && digits[index] !== ' ') {
        newDigits[index] = ' ';
        updateValue(newDigits);
      } else if (index > 0) {
        newDigits[index - 1] = ' ';
        updateValue(newDigits);
        focusInput(index - 1);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); focusInput(index - 1); }
    else if (e.key === 'ArrowRight' && index < 5) { e.preventDefault(); focusInput(index + 1); }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    updateValue(pasted.padEnd(6, ' ').split('').slice(0, 6));
    focusInput(Math.min(pasted.length, 5));
  };

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="Verification code">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={digits[i]?.trim() || ''}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          className="w-11 h-[52px] text-center text-xl font-mono font-semibold rounded-[11px] bg-surface-2 border border-line-strong text-content outline-none transition-colors focus:border-primary disabled:opacity-50"
          style={{ caretColor: 'transparent' }}
        />
      ))}
    </div>
  );
}
