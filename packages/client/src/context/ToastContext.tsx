import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type']) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

const TONE: Record<Toast['type'], string> = { success: 'var(--positive)', error: 'var(--negative)', info: 'var(--primary)' };
const ICON: Record<Toast['type'], ReactNode> = {
  success: <path d="M4 12l5 5L20 6" />,
  error: <path d="M6 6l12 12M18 6 6 18" />,
  info: <path d="M12 16v-4M12 8h.01" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), type === 'error' ? 5000 : 3000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col-reverse gap-2 w-[360px] max-w-[calc(100vw-40px)]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-elevated border border-line-strong shadow-md animate-[slideIn_0.2s_ease-out]"
          >
            <span
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: `color-mix(in srgb, ${TONE[t.type]} 14%, transparent)`, color: TONE[t.type] }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">{ICON[t.type]}</svg>
            </span>
            <span className="flex-1 min-w-0 text-sm font-semibold text-content leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Dismiss"
              className="shrink-0 -mr-1.5 w-7 h-7 flex items-center justify-center rounded-[8px] text-content-3 hover:text-content hover:bg-surface-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
