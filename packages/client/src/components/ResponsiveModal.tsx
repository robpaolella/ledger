import { useIsMobile } from '../hooks/useIsMobile';
import BottomSheet from './BottomSheet';

interface ResponsiveModalProps {
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function ResponsiveModal({ title, isOpen, onClose, children, maxWidth }: ResponsiveModalProps) {
  const isMobile = useIsMobile();

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        {children}
      </BottomSheet>
    );
  }

  // Desktop: centered modal (same pattern as existing local Modal functions)
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] rounded-xl p-6 w-full shadow-xl"
        style={{ maxWidth: maxWidth || '28rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
