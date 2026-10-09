import type { HTMLAttributes } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CARDS, type DashboardCardId } from './cardRegistry';

/**
 * useSortable wrapper, draggable only in customize mode. While dragging, the in-list wrapper becomes a dashed
 * ghost slot (inner card invisible but height-preserving) so the eventual drop
 * position is always visible; the DragOverlay portal carries the real card.
 */
export default function SortableDashboardCard({ id, customizing }: { id: DashboardCardId; customizing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !customizing });
  const { Component } = CARDS[id];
  const handleProps = { ...attributes, ...listeners } as HTMLAttributes<HTMLDivElement>;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'rounded-[16px] border-2 border-dashed border-line-strong bg-surface-2/40' : ''}
    >
      <div className={isDragging ? 'invisible' : ''}>
        <Component dragHandleProps={customizing ? handleProps : undefined} />
      </div>
    </div>
  );
}
