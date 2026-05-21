'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';

interface DaySchedule { open: string; close: string; }
interface BusinessHours { [key: string]: DaySchedule | null; }

interface HoursData {
  timezone: string;
  business_hours: BusinessHours | null;
  closed_message: string;
}

const DAYS = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: null,
  sun: null,
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function BusinessHoursSettings({ initial }: { initial: HoursData | null }) {
  const [data, setData] = useState<HoursData>(
    initial ?? { timezone: 'America/Sao_Paulo', business_hours: DEFAULT_HOURS, closed_message: '' }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const is24h = data.business_hours === null;
  const update = (patch: Partial<HoursData>) => setData((d) => ({ ...d, ...patch }));

  const toggleDay = (key: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = bh[key] ? null : { open: '09:00', close: '18:00' };
    update({ business_hours: bh });
  };

  const updateDayHour = (key: string, field: 'open' | 'close', value: string) => {
    const bh = { ...(data.business_hours || DEFAULT_HOURS) };
    bh[key] = { ...(bh[key] as DaySchedule), [field]: value };
    update({ business_hours: bh });
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-sm font-medium text-slate-800">Atendimento 24 horas</p>
          <p className="text-xs text-slate-400">Desabilita verificação de horário</p>
        </div>
        <button
          onClick={() => update({ business_hours: is24h ? DEFAULT_HOURS : null })}
          className={`relative h-6 w-11 rounded-full transition ${is24h ? 'bg-sky-500' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${is24h ? 'left-5' : 'left-0.5'}`} />
        </button>
      </div>

      {!is24h && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Fuso horário</label>
            <input className={inputClass} value={data.timezone} onChange={(e) => update({ timezone: e.target.value })} placeholder="America/Sao_Paulo" />
          </div>
          <div className="space-y-2">
            {DAYS.map(({ key, label }) => {
              const day = data.business_hours?.[key] as DaySchedule | null;
              return (
                <div key={key} className="flex items-center gap-3">
                  <label className="flex w-28 items-center gap-2">
                    <input type="checkbox" checked={!!day} onChange={() => toggleDay(key)} className="accent-sky-500" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                  {day && (
                    <>
                      <input type="time" value={day.open} onChange={(e) => updateDayHour(key, 'open', e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <span className="text-xs text-slate-400">às</span>
                      <input type="time" value={day.close} onChange={(e) => updateDayHour(key, 'close', e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Mensagem quando fechado</label>
            <textarea className={inputClass} rows={2} value={data.closed_message} onChange={(e) => update({ closed_message: e.target.value })} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Save size={13} strokeWidth={2} />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {saved && <span className="text-xs text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
