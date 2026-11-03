import type { ReactNode } from 'react';
import Button from './Button';

/** The "couldn't load" card shown in place of a page's content (the Budget Year card, shared). */
export default function LoadError({ title, message, onRetry, children }: {
  title: string; message: string; onRetry: () => void; children?: ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded-card shadow-sm p-6 md:p-10 flex flex-col items-center text-center gap-3" role="alert">
      <div className="text-[17px] font-extrabold text-content">{title}</div>
      <p className="text-sm text-content-3 m-0 max-w-[360px]">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onRetry}>Try again</Button>
        {children}
      </div>
    </div>
  );
}
