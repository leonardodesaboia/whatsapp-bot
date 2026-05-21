'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface Stage {
  id: number;
  name: string;
  color: string;
  position: number;
}

export default function StageManager({
  initialStages,
}: {
  initialStages: Stage[];
}) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6b7280');

  const handleAdd = async () => {
    if (!newName.trim()) {
      return;
    }

    const res = await fetch('/api/stages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    });
    const stage = await res.json();
    setStages((prev) => [...prev, stage]);
    setNewName('');
    setNewColor('#6b7280');
  };

  const handleUpdate = async (id: number, updates: Partial<Stage>) => {
    setStages((prev) =>
      prev.map((stage) => (stage.id === id ? { ...stage, ...updates } : stage))
    );

    await fetch(`/api/stages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        'Leads nesta etapa serão movidos para a primeira etapa. Confirmar?'
      )
    ) {
      return;
    }

    await fetch(`/api/stages/${id}`, { method: 'DELETE' });
    setStages((prev) => prev.filter((stage) => stage.id !== id));
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
          >
            <div
              className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-300"
              style={{ backgroundColor: stage.color }}
            >
              <input
                type="color"
                value={stage.color}
                onChange={(e) =>
                  void handleUpdate(stage.id, { color: e.target.value })
                }
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </div>
            <input
              type="text"
              defaultValue={stage.name}
              onBlur={(e) => {
                if (e.target.value && e.target.value !== stage.name) {
                  handleUpdate(stage.id, { name: e.target.value });
                }
              }}
              className="flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:bg-white"
            />
            <button
              onClick={() => handleDelete(stage.id)}
              className="text-slate-300 transition hover:text-rose-500"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 pt-3">
        <div
          className="relative h-9 w-9 overflow-hidden rounded-full border border-slate-300"
          style={{ backgroundColor: newColor }}
        >
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </div>
        <input
          type="text"
          placeholder="Nome da nova etapa"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleAdd();
            }
          }}
          className="flex-1 rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        />
        <button
          onClick={() => void handleAdd()}
          className="whitespace-nowrap rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
