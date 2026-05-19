'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  combinePtBrDateAndTime,
  formatDateInputPtBr,
  getTimeInputValue,
  isValid24HourTime,
  isValidPtBrDate,
  normalizeDateInput,
  normalizeTags,
  normalizeTagsInput,
  normalizeTimeInput,
} from '@/lib/leadUtils';

interface Stage {
  id: number;
  name: string;
  color: string;
}

interface Lead {
  id: number;
  phone: string;
  name: string | null;
  stage_id: number | null;
  assigned_to: string | null;
  products: string[];
  estimated_value: string | null;
  tags: string[];
  follow_up_at: string | Date | null;
  notes: string | null;
}

export default function LeadForm({
  lead,
  stages,
}: {
  lead: Lead;
  stages: Stage[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: lead.name || '',
    assigned_to: lead.assigned_to || '',
    products: (lead.products || []).join(', '),
    estimated_value: lead.estimated_value || '',
    tags: (lead.tags || []).join(', '),
    follow_up_date: formatDateInputPtBr(lead.follow_up_at),
    follow_up_time: getTimeInputValue(lead.follow_up_at),
    notes: lead.notes || '',
    stage_id: lead.stage_id?.toString() || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set =
    (key: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((current) => ({ ...current, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (form.follow_up_date && !isValidPtBrDate(form.follow_up_date)) {
      setError('Use a data no formato DD/MM/AAAA.');
      return;
    }

    if (form.follow_up_time && !isValid24HourTime(form.follow_up_time)) {
      setError('Use a hora no formato 24h, por exemplo 19:30.');
      return;
    }

    setSaving(true);

    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name || null,
        assigned_to: form.assigned_to || null,
        products: form.products
          ? form.products
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        estimated_value: form.estimated_value
          ? parseFloat(form.estimated_value)
          : null,
        tags: form.tags
          ? normalizeTags(form.tags)
          : [],
        follow_up_at: combinePtBrDateAndTime(
          form.follow_up_date,
          form.follow_up_time
        ),
        notes: form.notes || null,
        stage_id: form.stage_id ? parseInt(form.stage_id, 10) : null,
      }),
    });

    setSaving(false);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nome
          </label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Etapa
          </label>
          <select
            value={form.stage_id}
            onChange={set('stage_id')}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          >
            <option value="">Sem etapa</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Responsável
          </label>
          <input
            type="text"
            value={form.assigned_to}
            onChange={set('assigned_to')}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Valor estimado (R$)
          </label>
          <input
            type="number"
            step="0.01"
            value={form.estimated_value}
            onChange={set('estimated_value')}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Produtos
          </label>
          <input
            type="text"
            value={form.products}
            onChange={set('products')}
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Tags
          </label>
          <input
            type="text"
            value={form.tags}
            onChange={set('tags')}
            onBlur={() =>
              setForm((current) => ({
                ...current,
                tags: normalizeTagsInput(current.tags),
              }))
            }
            className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            Use vírgulas para separar. As tags são salvas em minúsculas com
            letras, números e hífen.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Próximo contato
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_0.7fr]">
            <input
              type="text"
              value={form.follow_up_date}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  follow_up_date: normalizeDateInput(e.target.value),
                }))
              }
              onBlur={() =>
                setForm((current) => ({
                  ...current,
                  follow_up_date: normalizeDateInput(current.follow_up_date),
                }))
              }
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
            <input
              type="text"
              value={form.follow_up_time}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  follow_up_time: normalizeTimeInput(e.target.value),
                }))
              }
              onBlur={() =>
                setForm((current) => ({
                  ...current,
                  follow_up_time: normalizeTimeInput(current.follow_up_time),
                }))
              }
              inputMode="numeric"
              placeholder="19:30"
              className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Serve como lembrete operacional para saber quando voltar a falar com
            este lead. Use `DD/MM/AAAA` e hora em 24 horas, como `19:30`.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Notas
        </label>
        <textarea
          rows={4}
          value={form.notes}
          onChange={set('notes')}
          className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
      </div>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  );
}
