/**
 * The standard button (DESIGN.md, "Buttons"). `buttonClasses` is the one source
 * of the recipes; `btnPrimary` & co. in `settings/ui.tsx` are built from it so
 * pages not yet moved to <Button> look the same.
 */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
/** md = 42px (footers, forms), sm = 40px (toolbars, panel headers), row = 34px (row actions). */
export type ButtonSize = 'md' | 'sm' | 'row';

const BASE = 'inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary font-bold text-sm shadow-sm hover:bg-primary-hover',
  secondary: 'bg-surface-2 border border-line-strong text-content font-semibold text-sm hover:bg-elevated',
  outline: 'bg-surface border border-line-strong text-content font-semibold text-sm hover:bg-surface-2',
  ghost: 'bg-transparent text-btn-ghost font-semibold text-sm hover:bg-surface-2 hover:text-content',
  danger: 'bg-transparent border border-line-strong text-negative font-bold text-sm hover:bg-negative/8',
};

/** Padding differs by variant at md/sm (today's recipes); icon-only buttons are square. */
const PAD: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: 'px-[22px]', sm: 'px-[18px]', row: 'px-3.5' },
  secondary: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  outline: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  ghost: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  danger: { md: 'px-[18px]', sm: 'px-3.5', row: 'px-3.5' },
};

const SIZE: Record<ButtonSize, { box: string; square: string; shape: string }> = {
  md: { box: 'h-[42px] gap-2', square: 'w-[42px]', shape: 'rounded-control' },
  sm: { box: 'h-10 gap-2', square: 'w-10', shape: 'rounded-control' },
  row: { box: 'h-[34px] gap-1.5 text-label', square: 'w-[34px]', shape: 'rounded-[9px]' },
};

export function buttonClasses({ variant = 'primary', size = 'md', iconOnly = false, active = false }: {
  variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean;
  /** Primary border while open or applied (outline variant). */
  active?: boolean;
} = {}) {
  const s = SIZE[size];
  let v = VARIANT[variant];
  // Row actions are muted until hovered (today's btnRow).
  if (size === 'row' && variant === 'secondary') v = v.replace('text-content ', 'text-content-2 hover:text-content ');
  if (size === 'row') v = v.replace('text-sm', '');
  if (active && variant === 'outline') v = v.replace('border-line-strong', 'border-primary');
  return [BASE, s.box, iconOnly ? s.square : PAD[variant][size], s.shape, v].join(' ').replace(/\s+/g, ' ').trim();
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  /** Disables the button, sets aria-busy and ignores clicks. Keep the "Saving…" wording in the label. */
  loading?: boolean;
  children?: ReactNode;
};
type Props = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & (
  | { iconOnly?: false }
  /** Icon-only buttons have no visible text, so an accessible name is required. */
  | { iconOnly: true; 'aria-label': string }
);

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', active = false, loading = false, iconOnly = false, className = '', type = 'button', disabled, onClick, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={`${buttonClasses({ variant, size, iconOnly, active })} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
});

export default Button;
