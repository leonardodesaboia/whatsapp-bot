'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateTime24h } from '@/lib/leadUtils';

interface Interaction {
  id: number;
  direction: string;
  content: string;
  type: string;
  created_at: string | Date;
}

interface Props {
  leadId: number;
  initialInteractions: Interaction[];
  totalCount: number;
  pageSize: number;
}

export default function InteractionTimeline({
  leadId,
  initialInteractions,
  totalCount,
  pageSize,
}: Props) {
  const [interactions, setInteractions] = useState(initialInteractions);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollRef = useRef<null | { height: number; top: number }>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (restoreScrollRef.current) {
      const { height, top } = restoreScrollRef.current;
      restoreScrollRef.current = null;
      container.scrollTop = container.scrollHeight - height + top;
      return;
    }

    if (page === 1 && interactions.length === initialInteractions.length) {
      container.scrollTop = container.scrollHeight;
    }
  }, [initialInteractions.length, interactions, page]);

  const loadOlder = async () => {
    if (loading || page >= totalPages) {
      return;
    }

    setLoading(true);
    setError('');
    const nextPage = page + 1;
    const container = scrollRef.current;
    if (container) {
      restoreScrollRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop,
      };
    }

    try {
      const res = await fetch(
        `/api/leads/${leadId}?page=${nextPage}&limit=${pageSize}`,
        { cache: 'no-store' }
      );

      if (!res.ok) {
        throw new Error('Falha ao carregar interações.');
      }

      const data = await res.json();
      setInteractions((current) => [...(data.interactions || []), ...current]);
      setPage(nextPage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao carregar interações.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container || loading || page >= totalPages) {
      return;
    }

    if (container.scrollTop <= 24) {
      void loadOlder();
    }
  };

  if (totalCount === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Nenhuma interação registrada.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
        <p>
          Página {page} de {totalPages}
        </p>
        <p>
          {page >= totalPages
            ? 'Histórico completo carregado'
            : 'Role até o topo para carregar conversas anteriores'}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="max-h-[28rem] space-y-3 overflow-y-auto pr-2"
      >
        {loading ? (
          <p className="pb-2 text-center text-xs text-slate-400">
            Carregando conversas anteriores...
          </p>
        ) : null}

        {interactions.map((interaction) => (
          <div
            key={interaction.id}
            className={`flex ${
              interaction.direction === 'out' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-sm rounded-2xl px-3 py-2 text-sm ${
                interaction.direction === 'out'
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-100 text-slate-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{interaction.content}</p>
              <p
                className={`mt-1 text-xs ${
                  interaction.direction === 'out'
                    ? 'text-slate-300'
                    : 'text-slate-400'
                }`}
              >
                {formatDateTime24h(interaction.created_at)}
                {interaction.type !== 'text' ? ` · ${interaction.type}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="min-h-5 border-t border-slate-100 pt-3 text-center text-xs text-rose-500">
        {error}
      </div>
    </div>
  );
}
