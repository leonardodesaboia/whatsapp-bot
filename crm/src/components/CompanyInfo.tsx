'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';

interface CompanyData {
  id?: number;
  nome: string;
  descricao: string;
  horario: string;
  contato: string;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function CompanyInfo({ initial }: { initial: CompanyData | null }) {
  const [data, setData] = useState<CompanyData>(
    initial ?? { nome: '', descricao: '', horario: '', contato: '' }
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (patch: Partial<CompanyData>) => setData((d) => ({ ...d, ...patch }));

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
      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nome da empresa</label>
          <input className={inputClass} value={data.nome} onChange={(e) => update({ nome: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descrição</label>
          <textarea className={inputClass} rows={3} value={data.descricao} onChange={(e) => update({ descricao: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Horário (texto exibido ao cliente)</label>
          <input className={inputClass} placeholder="ex: Seg–Sex 9h às 18h" value={data.horario} onChange={(e) => update({ horario: e.target.value })} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Contato</label>
          <input className={inputClass} placeholder="e-mail ou telefone" value={data.contato} onChange={(e) => update({ contato: e.target.value })} />
        </div>
      </div>
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
