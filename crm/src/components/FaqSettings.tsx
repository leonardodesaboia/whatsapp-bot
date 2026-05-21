'use client';

import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';

interface FaqItem { pergunta: string; resposta: string; }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function FaqSettings({ initial }: { initial: FaqItem[] }) {
  const [faq, setFaq] = useState<FaqItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addItem = () => setFaq((f) => [...f, { pergunta: '', resposta: '' }]);

  const updateItem = (i: number, field: 'pergunta' | 'resposta', value: string) =>
    setFaq((f) => f.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const removeItem = (i: number) => setFaq((f) => f.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faq }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-3">
      {faq.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Pergunta {i + 1}</span>
            <button onClick={() => removeItem(i)} className="text-slate-300 transition hover:text-rose-500">
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </div>
          <div className="space-y-2">
            <input className={inputClass} placeholder="Pergunta" value={item.pergunta} onChange={(e) => updateItem(i, 'pergunta', e.target.value)} />
            <textarea className={inputClass} rows={2} placeholder="Resposta" value={item.resposta} onChange={(e) => updateItem(i, 'resposta', e.target.value)} />
          </div>
        </div>
      ))}

      <button
        onClick={addItem}
        className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
      >
        <Plus size={13} strokeWidth={2} />
        Adicionar pergunta
      </button>

      <div className="flex items-center gap-3 pt-2">
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
