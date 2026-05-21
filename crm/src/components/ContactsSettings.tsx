'use client';

import { useState } from 'react';

interface Contact { id: number; phone: string; name: string | null; }
interface Lead { id: number; phone: string; name: string | null; stage_id: number; }
interface Stage { id: number; name: string; }

export default function ContactsSettings({
  initialContacts,
  leads,
  stages,
}: {
  initialContacts: Contact[];
  leads: Lead[];
  stages: Stage[];
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [filterStage, setFilterStage] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  const addContact = async () => {
    if (!newPhone.trim()) return;
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: newPhone.trim(), name: newName.trim() || null }),
    });
    const contact = await res.json();
    setContacts((prev) => {
      const existing = prev.findIndex((c) => c.id === contact.id);
      if (existing >= 0) return prev.map((c) => c.id === contact.id ? contact : c);
      return [...prev, contact].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    });
    setNewPhone('');
    setNewName('');
  };

  const removeContact = async (id: number) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const filteredLeads = filterStage
    ? leads.filter((l) => l.stage_id === filterStage)
    : leads;

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_ids: Array.from(selected) }),
    });
    const { imported } = await res.json();
    setImporting(false);
    setShowImport(false);
    setSelected(new Set());

    // refresh contacts list
    const fresh = await fetch('/api/contacts').then((r) => r.json());
    setContacts(fresh);
    alert(`${imported} contato(s) importado(s).`);
  };

  const inputClass = 'rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="space-y-4">
      {/* Adicionar avulso */}
      <div className="flex gap-2">
        <input className={`${inputClass} flex-1`} placeholder="Telefone (ex: 5511999999999)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
        <input className={`${inputClass} flex-1`} placeholder="Nome (opcional)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addContact(); }} />
        <button onClick={() => void addContact()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Adicionar</button>
        <button onClick={() => setShowImport(true)} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Importar do funil</button>
      </div>

      {/* Lista de contatos */}
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {contacts.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Nenhum contato cadastrado</p>}
        {contacts.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
            <span className="text-slate-800">{c.name || <span className="text-slate-400">Sem nome</span>} <span className="text-slate-400 ml-2">{c.phone}</span></span>
            <button onClick={() => void removeContact(c.id)} className="text-rose-500 hover:text-rose-600 text-xs">Remover</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">{contacts.length} contato(s)</p>

      {/* Modal de importação */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Importar do funil</h3>
            <select className={`${inputClass} w-full`} value={filterStage ?? ''} onChange={(e) => setFilterStage(e.target.value ? parseInt(e.target.value) : null)}>
              <option value="">Todas as etapas</option>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredLeads.map((lead) => (
                <label key={lead.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)} className="accent-sky-500" />
                  <span className="text-sm text-slate-700">{lead.name || 'Sem nome'} <span className="text-slate-400">{lead.phone}</span></span>
                </label>
              ))}
              {filteredLeads.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">Nenhum lead nesta etapa</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowImport(false); setSelected(new Set()); }} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => void importSelected()} disabled={selected.size === 0 || importing} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                {importing ? 'Importando…' : `Importar ${selected.size > 0 ? `(${selected.size})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
