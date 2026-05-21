'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';

interface CompanyData {
  id?: number;
  nome: string;
  descricao: string;
  contato: string;
}

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function CompanyInfo({ initial }: { initial: CompanyData | null }) {
  const [data, setData] = useState<CompanyData>(
    initial ?? { nome: '', descricao: '', contato: '' }
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Contexto do bot</label>
          <p className="mb-1.5 text-xs text-slate-400">
            Explica ao bot o que é a empresa, como ele deve se comportar e o que pode ou não responder.
            Quanto mais detalhado, melhor a qualidade das respostas.
          </p>
          <textarea
            className={inputClass}
            rows={5}
            value={data.descricao}
            onChange={(e) => update({ descricao: e.target.value })}
            placeholder={`Exemplo:
Somos um salão de beleza especializado em cortes, coloração e tratamentos capilares. Atendemos apenas com hora marcada.

Use linguagem informal e simpática. Nunca mencione preços sem antes verificar com o cliente o serviço desejado. Não responda perguntas sobre concorrentes.`}
          />
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
