import { useState, forwardRef } from 'react';

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  placeholder?: string;
  allowNegative?: boolean;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}

function formatCurrency(val: string): string {
  if (val === '' || val === '-') return val;
  const num = parseFloat(val);
  if (isNaN(num)) return val;
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${num < 0 ? '-' : ''}$${formatted}`;
}

const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, className, autoFocus, onKeyDown, onBlur, placeholder = '$0.00', allowNegative = false, id, invalid, describedBy }, ref) => {
    const [focused, setFocused] = useState(!!autoFocus);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setFocused(true);
      setTimeout(() => e.target.select(), 0);
    };

    const handleBlur = () => {
      setFocused(false);
      onBlur?.();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let raw = e.target.value;
      if (allowNegative) {
        raw = raw.replace(/[^0-9.-]/g, '');
      } else {
        raw = raw.replace(/[^0-9.]/g, '');
      }
      onChange(raw);
    };

    return (
      <input
        ref={ref}
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        type="text"
        inputMode="decimal"
        value={focused ? value : formatCurrency(value)}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        className={className}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    );
  }
);

CurrencyInput.displayName = 'CurrencyInput';

export default CurrencyInput;
