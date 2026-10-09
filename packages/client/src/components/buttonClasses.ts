/**
 * Class recipes for the standard button (DESIGN.md, "Buttons"). `<Button>` and
 * the `btnPrimary` & co. strings in `settings/ui.tsx` are both built from here,
 * so pages not yet moved to <Button> look the same.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
/** md = 42px (footers, forms), sm = 40px (toolbars, panel headers), row = 34px (row actions). */
export type ButtonSize = 'md' | 'sm' | 'row';

const BASE = 'inline-flex items-center justify-center whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary font-bold shadow-sm hover:bg-primary-hover',
  secondary: 'bg-surface-2 border border-line-strong text-content font-semibold hover:bg-elevated',
  outline: 'bg-surface border border-line-strong text-content font-semibold hover:bg-surface-2',
  ghost: 'bg-transparent text-btn-ghost font-semibold hover:bg-surface-2 hover:text-content',
  danger: 'bg-transparent border border-line-strong text-negative font-bold hover:bg-negative/8',
};
/** Outline while open or applied: primary border. */
const OUTLINE_ACTIVE = 'bg-surface border border-primary text-content font-semibold hover:bg-surface-2';
/** Row actions are muted until hovered. */
const ROW_SECONDARY = 'bg-surface-2 border border-line-strong text-content-2 font-semibold hover:text-content hover:bg-elevated';

/** Padding differs by variant at md/sm (today's recipes); icon-only buttons are square. */
const PAD: Record<ButtonVariant, Record<ButtonSize, string>> = {
  primary: { md: 'px-[22px]', sm: 'px-[18px]', row: 'px-3.5' },
  secondary: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  outline: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  ghost: { md: 'px-5', sm: 'px-3.5', row: 'px-3.5' },
  danger: { md: 'px-[18px]', sm: 'px-3.5', row: 'px-3.5' },
};

const SIZE: Record<ButtonSize, { box: string; square: string; shape: string }> = {
  md: { box: 'h-[42px] gap-2 text-sm', square: 'w-[42px]', shape: 'rounded-control' },
  sm: { box: 'h-10 gap-2 text-sm', square: 'w-10', shape: 'rounded-control' },
  row: { box: 'h-[34px] gap-1.5 text-label', square: 'w-[34px]', shape: 'rounded-[9px]' },
};

export function buttonClasses({ variant = 'primary', size = 'md', iconOnly = false, active = false }: {
  variant?: ButtonVariant; size?: ButtonSize; iconOnly?: boolean;
  /** Outline variant: primary border while open or applied. */
  active?: boolean;
} = {}) {
  const s = SIZE[size];
  const v = active && variant === 'outline' ? OUTLINE_ACTIVE
    : size === 'row' && variant === 'secondary' ? ROW_SECONDARY
    : VARIANT[variant];
  return [BASE, s.box, iconOnly ? s.square : PAD[variant][size], s.shape, v].join(' ').replace(/\s+/g, ' ').trim();
}

