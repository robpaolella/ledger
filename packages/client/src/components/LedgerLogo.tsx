import { useId } from 'react';

/**
 * Ledger brand mark — a bold "L" whose ledger-row entries step to the right, on
 * an all-blue gradient. Master spec: docs/design_handoff_ledger_platform/
 * specs/00-shell-and-navigation.md. Gradient id is per-instance so multiple
 * renders don't collide.
 */
export default function LedgerLogo({ size = 30, className }: { size?: number; className?: string }) {
  const gid = `ledger-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Ledger"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b93ff" />
          <stop offset="1" stopColor="#2c72e6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="96" height="96" rx="26" fill={`url(#${gid})`} />
      <g fill="#fff">
        <rect x="29" y="26" width="12" height="48" rx="6" />
        <rect x="29" y="62" width="42" height="12" rx="6" />
        <rect x="49" y="26" width="30" height="10" rx="5" opacity=".95" />
        <rect x="49" y="44" width="21" height="10" rx="5" opacity=".72" />
      </g>
    </svg>
  );
}
