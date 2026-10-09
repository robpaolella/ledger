import { useEffect, useRef, useState, type ReactNode } from 'react';
import PageHeader from '../components/PageHeader';
import Button from '../components/Button';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, closestCorners,
  useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { CARDS, type DashboardCardId } from '../components/dashboard/cardRegistry';
import { useDashboardLayout, type DashboardLayout } from '../components/dashboard/useDashboardLayout';
import SortableDashboardCard from '../components/dashboard/SortableDashboardCard';

type Column = 'left' | 'right';

const columnOf = (layout: DashboardLayout, id: UniqueIdentifier): Column | null => {
  if (id === 'col-left') return 'left';
  if (id === 'col-right') return 'right';
  if (layout.left.includes(id as DashboardCardId)) return 'left';
  if (layout.right.includes(id as DashboardCardId)) return 'right';
  return null;
};

/** Column stack; droppable so cards can be dropped into an emptied column. */
function DroppableColumn({ column, children }: { column: Column; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `col-${column}` });
  return (
    <div ref={setNodeRef} className="flex flex-col gap-5 min-h-[120px]">
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { layout, setLayout, resetLayout } = useDashboardLayout();
  const [customizing, setCustomizing] = useState(false);
  const [activeId, setActiveId] = useState<DashboardCardId | null>(null);
  const dragSnapshot = useRef<DashboardLayout | null>(null);

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Escape leaves customize mode, keeping the layout. During a drag, dnd-kit's own
  // Escape handler cancels the drag; `activeId` is still set in this render's
  // closure when that happens, so the mode stays.
  useEffect(() => {
    if (!customizing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !activeId) setCustomizing(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [customizing, activeId]);

  // Customize is desktop-only; leaving for a phone-width viewport ends the mode.
  useEffect(() => { if (isMobile) setCustomizing(false); }, [isMobile]);

  const onDragStart = (e: DragStartEvent) => {
    dragSnapshot.current = layout;
    setActiveId(e.active.id as DashboardCardId);
  };

  // Cross-column moves happen live so the ghost slot tracks the drop position.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    setLayout((prev) => {
      const from = columnOf(prev, active.id);
      const to = columnOf(prev, over.id);
      if (!from || !to || from === to) return prev;
      const source = prev[from].filter((id) => id !== active.id);
      const target = [...prev[to]];
      const overIdx = target.indexOf(over.id as DashboardCardId);
      target.splice(overIdx >= 0 ? overIdx : target.length, 0, active.id as DashboardCardId);
      return { ...prev, [from]: source, [to]: target };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    dragSnapshot.current = null;
    if (!over || active.id === over.id) return;
    setLayout((prev) => {
      const from = columnOf(prev, active.id);
      const to = columnOf(prev, over.id);
      if (!from || !to || from !== to) return prev; // cross-column handled in onDragOver
      const oldIndex = prev[from].indexOf(active.id as DashboardCardId);
      const newIndex = prev[from].indexOf(over.id as DashboardCardId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, [from]: arrayMove(prev[from], oldIndex, newIndex) };
    });
  };

  const onDragCancel = () => {
    if (dragSnapshot.current) setLayout(dragSnapshot.current);
    dragSnapshot.current = null;
    setActiveId(null);
  };

  const greeting = user?.displayName ? `Hello, ${user.displayName.split(' ')[0]}!` : 'Dashboard';
  const ActiveCard = activeId ? CARDS[activeId].Component : null;

  return (
    <div className="pb-16">
      <PageHeader
        title={greeting}
        mobileTitle="Dashboard"
        right={!isMobile && (customizing ? (
          <>
            <Button variant="outline" size="sm" onClick={resetLayout}>Reset layout</Button>
            <Button size="sm" onClick={() => setCustomizing(false)}>Done</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCustomizing(true)}>Customize</Button>
        ))}
      />

      {isMobile ? (
        // Static single column on mobile — no drag-and-drop.
        <div className="flex flex-col gap-5">
          {[...layout.left, ...layout.right].map((id) => {
            const { Component } = CARDS[id];
            return <Component key={id} />;
          })}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className="grid lg:grid-cols-2 gap-5 items-start">
            {(['left', 'right'] as const).map((col) => (
              <SortableContext key={col} items={layout[col]} strategy={verticalListSortingStrategy}>
                <DroppableColumn column={col}>
                  {layout[col].map((id) => <SortableDashboardCard key={id} id={id} customizing={customizing} />)}
                </DroppableColumn>
              </SortableContext>
            ))}
          </div>
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 180 }}>
              {ActiveCard && (
                <div className="rounded-[16px] shadow-md cursor-grabbing">
                  <ActiveCard />
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}
    </div>
  );
}
