'use client';

import { KanbanBoard } from '@/components/kanban/kanban-board';

export default function KanbanPage() {
  return (
    <div className="h-[calc(100dvh-48px)] overflow-hidden">
      <KanbanBoard />
    </div>
  );
}
