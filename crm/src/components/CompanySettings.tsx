'use client';

import { useState } from 'react';

interface FaqItem { pergunta: string; resposta: string; }

interface DaySchedule { open: string; close: string; }

interface BusinessHours {
  [key: string]: DaySchedule | null;
}

interface CompanyData {
  id?: number;
  nome: string;
  descricao: string;
  horario: string;
  contato: string;
  faq: FaqItem[];
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

export default function CompanySettings({ initial }: { initial: CompanyData | null }) {
  const empty: CompanyData = {
    nome: '', descricao: '', horario: '', contato: '',
    faq: [], timezone: 'America/Sao_Paulo',
    business_hours: DEFAULT_HOURS, closed_message: '',
  };
  const [data, setData] = useState<CompanyData>(initial || empty);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const is24h = data.business_hours === null;

  const update = (patch: Partial<CompanyData>) => setData((d) => ({ ...d, ...patch }));

  const addFaq = () => update({ faq: [...data.faq, { pergunta: '', resposta: '' }] });

  const updateFaq = (i: number, field: 'pergunta' | 'resposta', value: string) => {
    const faq = data.faq.map((f, idx) => idx === i ? { ...f, [field]: value } : f);
    update({ faq });
  };

  const removeFaq = (i: number) => update({ faq: data.faq.filter((_, idx) => idx !== i) });

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

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="space-y-8">
      {/* Empresa */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Empresa</h2>
        <div className="space-y-3">
          <input className={inputClass} placeholder="Nome da empresa" value={data.nome} onChange={(e) => update({ nome: e.target.value })} />
          <textarea className={inputClass} rows={2} placeholder="Descrição" value={data.descricao} onChange={(e) => update({ descricao: e.target.value })} />
          <input className={inputClass} placeholder="Horário de atendimento (texto, ex: Seg-Sex 9h–18h)" value={data.horario} onChange={(e) => update({ horario: e.target.value })} />
          <input className={inputClass} placeholder="Contato (e-mail, telefone)" value={data.contato} onChange={(e) => update({ contato: e.target.value })} />
        </div>
      </section>

      {/* Horário de Funcionamento */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Horário de Funcionamento</h2>
        <label className="mb-4 flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => update({ business_hours: is24h ? DEFAULT_HOURS : null })}
            className={`relative h-6 w-11 rounded-full transition ${is24h ? 'bg-sky-500' : 'bg-slate-200'}`}
          >
            <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${is24h ? 'left-5' : 'left-0.5'}`} />
          </div>
          <span className="text-sm font-medium text-slate-700">Atendimento 24h</span>
        </label>

        {!is24h && (
          <div className="space-y-3">
            <input className={inputClass} placeholder="Fuso horário (ex: America/Sao_Paulo)" value={data.timezone} onChange={(e) => update({ timezone: e.target.value })} />
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => {
                const day = data.business_hours?.[key] as DaySchedule | null;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <label className="flex items-center gap-2 w-28">
                      <input type="checkbox" checked={!!day} onChange={() => toggleDay(key)} className="accent-sky-500" />
                      <span className="text-sm text-slate-700">{label}</span>
                    </label>
                    {day && (
                      <>
                        <input type="time" value={day.open} onChange={(e) => updateDayHour(key, 'open', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                        <span className="text-slate-400 text-sm">às</span>
                        <input type="time" value={day.close} onChange={(e) => updateDayHour(key, 'close', e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <textarea className={inputClass} rows={2} placeholder="Mensagem quando fechado" value={data.closed_message} onChange={(e) => update({ closed_message: e.target.value })} />
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">FAQ</h2>
        <div className="space-y-3">
          {data.faq.map((f, i) => (
            <div key={i} className="flex gap-2 items-start rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex-1 space-y-2">
                <input className={inputClass} placeholder="Pergunta" value={f.pergunta} onChange={(e) => updateFaq(i, 'pergunta', e.target.value)} />
                <textarea className={inputClass} rows={2} placeholder="Resposta" value={f.resposta} onChange={(e) => updateFaq(i, 'resposta', e.target.value)} />
              </div>
              <button onClick={() => removeFaq(i)} className="text-sm text-rose-500 hover:text-rose-600 mt-1">Remover</button>
            </div>
          ))}
          <button onClick={addFaq} className="text-sm font-medium text-sky-600 hover:text-sky-700">+ Adicionar pergunta</button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-2xl bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar configurações'}
        </button>
        {saved && <span className="text-sm text-emerald-600">Salvo!</span>}
      </div>
    </div>
  );
}
