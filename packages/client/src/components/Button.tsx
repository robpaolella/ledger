/** The standard button (DESIGN.md, "Buttons"); the recipes live in `buttonClasses.ts`. */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClasses } from './buttonClasses';
import type { ButtonVariant, ButtonSize } from './buttonClasses';

export type { ButtonVariant, ButtonSize };

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
