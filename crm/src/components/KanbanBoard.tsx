'use client';

import { useEffect, useRef, useState } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import LeadCard from './LeadCard';

interface Stage {
  id: number;
  name: string;
  color: string;
  position: number;
}

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  stage_id: number | null;
  last_message: string | null;
  tags: string[];
  estimated_value: string | null;
  follow_up_at: string | null;
}

interface Props {
  stages: Stage[];
  leads: Lead[];
}

const POLL_INTERVAL_MS = 15000;

export default function KanbanBoard({ stages, leads: initialLeads }: Props) {
  const [leads, setLeads] = useState(initialLeads);
  const [isDragging, setIsDragging] = useState(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    const refreshLeads = async () => {
      if (
        document.visibilityState !== 'visible' ||
        isDragging ||
        isFetchingRef.current
      ) {
        return;
      }

      isFetchingRef.current = true;

      try {
        const res = await fetch('/api/leads', { cache: 'no-store' });
        if (!res.ok) {
          return;
        }

        const nextLeads = await res.json();
        setLeads(nextLeads);
      } finally {
        isFetchingRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshLeads();
    }, POLL_INTERVAL_MS);

    const handleVisibility = () => {
      void refreshLeads();
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isDragging]);

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);

    if (!result.destination) {
      return;
    }

    const leadId = parseInt(result.draggableId, 10);
    const newStageId = parseInt(result.destination.droppableId, 10);

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, stage_id: newStageId } : lead
      )
    );

    await fetch(`/api/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage_id: newStageId }),
    });
  };

  return (
    <DragDropContext
      onDragStart={() => setIsDragging(true)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-[calc(100vh-140px)] gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.stage_id === stage.id);

          return (
            <Droppable key={stage.id} droppableId={stage.id.toString()}>
              {(provided, snapshot) => (
                <section
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`w-72 flex-shrink-0 rounded-3xl border p-3 transition ${
                    snapshot.isDraggingOver
                      ? 'border-sky-300 bg-sky-50/70'
                      : 'border-slate-200 bg-white/70'
                  }`}
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="text-sm font-semibold text-slate-700">
                      {stage.name}
                    </h3>
                    <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {stageLeads.length}
                    </span>
                  </div>

                  {stageLeads.map((lead, index) => (
                    <Draggable
                      key={lead.id}
                      draggableId={lead.id.toString()}
                      index={index}
                    >
                      {(draggableProvided) => (
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          {...draggableProvided.dragHandleProps}
                        >
                          <LeadCard lead={lead} />
                        </div>
                      )}
                    </Draggable>
                  ))}

                  {provided.placeholder}
                </section>
              )}
            </Droppable>
          );
        })}
      </div>
    </DragDropContext>
  );
}
