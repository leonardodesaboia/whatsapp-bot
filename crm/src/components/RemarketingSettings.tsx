'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface Step {
  id: number;
  campaign_id: number;
  position: number;
  delay_days: number;
  message: string;
}

interface Campaign {
  id: number;
  name: string;
  active: boolean;
  trigger_days: number;
  stage_filter: number | null;
  step_count: number;
  active_enrollments: number;
  completed_enrollments: number;
}

interface Stage { id: number; name: string; }

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export default function RemarketingSettings({
  initialCampaigns,
  stages,
}: {
  initialCampaigns: Campaign[];
  stages: Stage[];
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [selectedId, setSelectedId] = useState<number | null>(initialCampaigns[0]?.id ?? null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoaded, setStepsLoaded] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newStep, setNewStep] = useState({ delay_days: '1', message: '' });

  const selected = campaigns.find((c) => c.id === selectedId);

  const loadSteps = async (campaignId: number) => {
    if (stepsLoaded === campaignId) return;
    const res = await fetch(`/api/remarketing/campaigns/${campaignId}/steps`);
    const data = await res.json();
    setSteps(data);
    setStepsLoaded(campaignId);
  };

  const selectCampaign = (id: number) => {
    setSelectedId(id);
    void loadSteps(id);
  };

  const addCampaign = async () => {
    if (!newName.trim()) return;
    const res = await fetch('/api/remarketing/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const campaign = await res.json();
    setCampaigns((prev) => [...prev, campaign]);
    setNewName('');
    selectCampaign(campaign.id);
  };

  const toggleActive = async (campaign: Campaign) => {
    await fetch(`/api/remarketing/campaigns/${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !campaign.active }),
    });
    setCampaigns((prev) => prev.map((c) => c.id === campaign.id ? { ...c, active: !c.active } : c));
  };

  const deleteCampaign = async (id: number) => {
    if (!window.confirm('Excluir campanha e todos os seus passos?')) return;
    await fetch(`/api/remarketing/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(campaigns.find((c) => c.id !== id)?.id ?? null);
  };

  const updateCampaignField = async (id: number, field: string, value: unknown) => {
    await fetch(`/api/remarketing/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setCampaigns((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const addStep = async () => {
    if (!selected || !newStep.message.trim()) return;
    const res = await fetch(`/api/remarketing/campaigns/${selected.id}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delay_days: parseInt(newStep.delay_days) || 1, message: newStep.message.trim() }),
    });
    const step = await res.json();
    setSteps((prev) => [...prev, step]);
    setNewStep({ delay_days: '1', message: '' });
  };

  const updateStep = async (stepId: number, field: string, value: unknown) => {
    await fetch(`/api/remarketing/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, [field]: value } : s));
  };

  const deleteStep = async (stepId: number) => {
    await fetch(`/api/remarketing/steps/${stepId}`, { method: 'DELETE' });
    setSteps((prev) => prev.filter((s) => s.id !== stepId).map((s, i) => ({ ...s, position: i })));
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...steps];
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    const withPositions = reordered.map((s, i) => ({ ...s, position: i }));
    setSteps(withPositions);
    for (const s of withPositions) {
      await fetch(`/api/remarketing/steps/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: s.position }),
      });
    }
  };

  const campaignSteps = steps.filter((s) => s.campaign_id === selectedId);

  return (
    <div className="flex gap-6" style={{ minHeight: 400 }}>
      {/* Campaign list */}
      <div className="w-64 shrink-0">
        <div className="space-y-1">
          {campaigns.map((c) => (
            <div
              key={c.id}
              onClick={() => selectCampaign(c.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 transition ${selectedId === c.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${selectedId === c.id ? 'text-slate-900' : 'text-slate-700'}`}>{c.name}</p>
                <p className="text-xs text-slate-400">
                  {c.step_count} passo{Number(c.step_count) !== 1 ? 's' : ''} · {c.active_enrollments} ativo{Number(c.active_enrollments) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); void toggleActive(c); }}
                  className={`transition ${c.active ? 'text-sky-500 hover:text-sky-600' : 'text-slate-300 hover:text-slate-400'}`}
                >
                  {c.active ? <ToggleRight size={18} strokeWidth={2} /> : <ToggleLeft size={18} strokeWidth={2} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void deleteCampaign(c.id); }}
                  className="text-slate-300 transition hover:text-rose-500"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
                <ChevronRight size={13} strokeWidth={2} className={selectedId === c.id ? 'text-slate-400' : 'text-slate-200'} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-1">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
            placeholder="Nova campanha"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addCampaign(); }}
          />
          <button onClick={() => void addCampaign()} className="rounded-lg bg-slate-950 px-2.5 text-white">
            <Plus size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* Campaign config + steps */}
      {selected ? (
        <div className="flex-1 space-y-4">
          {/* Config */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nome</label>
                <input
                  className={inputClass}
                  defaultValue={selected.name}
                  onBlur={(e) => { if (e.target.value !== selected.name) void updateCampaignField(selected.id, 'name', e.target.value); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Dias sem resposta para enrolar</label>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  defaultValue={selected.trigger_days}
                  onBlur={(e) => void updateCampaignField(selected.id, 'trigger_days', parseInt(e.target.value) || 3)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Etapa alvo (opcional)</label>
                <select
                  className={inputClass}
                  value={selected.stage_filter ?? ''}
                  onChange={(e) => void updateCampaignField(selected.id, 'stage_filter', e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">Todas as etapas</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <p className="text-xs text-slate-400">
                  {String(selected.active_enrollments)} enrolados · {String(selected.completed_enrollments)} concluídos
                </p>
              </div>
            </div>
          </div>

          {/* Steps */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Sequência de mensagens</p>
            <DragDropContext onDragEnd={(r) => void onDragEnd(r)}>
              <Droppable droppableId="steps">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {campaignSteps.map((step, index) => (
                      <Draggable key={step.id} draggableId={String(step.id)} index={index}>
                        {(drag) => (
                          <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
                            className="rounded-xl border border-slate-200 bg-white p-3"
                          >
                            <div className="mb-2 flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-400">Passo {index + 1}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400">após</span>
                                <input
                                  type="number"
                                  min={1}
                                  defaultValue={step.delay_days}
                                  onBlur={(e) => void updateStep(step.id, 'delay_days', parseInt(e.target.value) || 1)}
                                  className="w-12 rounded border border-slate-200 px-1.5 py-0.5 text-xs text-center"
                                />
                                <span className="text-xs text-slate-400">dia{step.delay_days !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex-1" />
                              <button onClick={() => void deleteStep(step.id)} className="text-slate-300 transition hover:text-rose-500">
                                <Trash2 size={13} strokeWidth={2} />
                              </button>
                            </div>
                            <textarea
                              className={inputClass}
                              rows={2}
                              defaultValue={step.message}
                              onBlur={(e) => { if (e.target.value !== step.message) void updateStep(step.id, 'message', e.target.value); }}
                              placeholder="Mensagem... use {{nome}} para o nome do lead"
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase">Novo passo</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 whitespace-nowrap">Enviar após</span>
                <input
                  type="number"
                  min={1}
                  value={newStep.delay_days}
                  onChange={(e) => setNewStep((s) => ({ ...s, delay_days: e.target.value }))}
                  className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-center"
                />
                <span className="text-xs text-slate-500">dias</span>
              </div>
              <textarea
                className={inputClass}
                rows={2}
                value={newStep.message}
                onChange={(e) => setNewStep((s) => ({ ...s, message: e.target.value }))}
                placeholder="Mensagem... use {{nome}} para o nome do lead"
              />
              <button
                onClick={() => void addStep()}
                className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus size={13} strokeWidth={2} />
                Adicionar passo
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="flex-1 pt-8 text-center text-sm text-slate-400">Selecione ou crie uma campanha</p>
      )}
    </div>
  );
}
