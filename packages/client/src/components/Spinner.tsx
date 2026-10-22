/** Loading indicator. Default = centered block with vertical padding (page/card
 *  loading). `inline` renders just the ring for buttons and small slots. */
export default function Spinner({ size = 32, inline = false, className = '' }: { size?: number; inline?: boolean; className?: string }) {
  const ring = (
    <div
      className={`rounded-full animate-spin border-line border-t-primary ${inline ? className : ''}`}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 10)) }}
      role="status"
      aria-label="Loading"
    />
  );
  if (inline) return ring;
  return <div className={`flex items-center justify-center py-16 ${className}`}>{ring}</div>;
}
