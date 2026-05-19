'use client';

import Link from 'next/link';
import { formatDateTime24h } from '@/lib/leadUtils';

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  last_message: string | null;
  tags: string[];
  estimated_value: string | null;
  follow_up_at: string | Date | null;
}

export default function LeadCard({ lead }: { lead: Lead }) {
  const isOverdue =
    lead.follow_up_at && new Date(lead.follow_up_at) < new Date();

  return (
    <Link href={`/leads/${lead.id}`}>
      <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <p className="truncate text-sm font-semibold text-slate-900">
          {lead.name || lead.phone}
        </p>
        {lead.name ? (
          <p className="mt-0.5 text-xs text-slate-400">{lead.phone}</p>
        ) : null}
        {lead.last_message ? (
          <p className="mt-2 truncate text-xs text-slate-500">
            {lead.last_message}
          </p>
        ) : null}
        {lead.tags?.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {lead.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          {lead.estimated_value ? (
            <p className="text-xs font-semibold text-emerald-600">
              R${' '}
              {parseFloat(lead.estimated_value).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
              })}
            </p>
          ) : (
            <span />
          )}
          {lead.follow_up_at ? (
            <p
              className={`text-xs ${
                isOverdue ? 'font-medium text-rose-500' : 'text-slate-400'
              }`}
              title={formatDateTime24h(lead.follow_up_at)}
            >
              {formatDateTime24h(lead.follow_up_at)}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
