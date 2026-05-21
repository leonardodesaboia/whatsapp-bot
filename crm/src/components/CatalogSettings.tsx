'use client';

import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface CatalogItem {
  id: number;
  category_id: number;
  slug: string;
  title: string;
  description: string;
  price: string;
  duration: number | null;
  position: number;
}

interface Category {
  id: number;
  slug: string;
  title: string;
  position: number;
  items: CatalogItem[];
}

function slugify(str: string) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function CatalogSettings({ initialCategories }: { initialCategories: Category[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [selectedId, setSelectedId] = useState<number | null>(initialCategories[0]?.id ?? null);
  const [newCatTitle, setNewCatTitle] = useState('');
  const [newItem, setNewItem] = useState({ title: '', description: '', price: '', duration: '' });
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  const selectedCat = categories.find((c) => c.id === selectedId);

  const reorder = <T,>(list: T[], from: number, to: number): T[] => {
    const result = [...list];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  };

  const onDragEndCategories = async (result: DropResult) => {
    if (!result.destination) return;
    const reordered = reorder(categories, result.source.index, result.destination.index)
      .map((c, i) => ({ ...c, position: i }));
    setCategories(reordered);
    for (const cat of reordered) {
      await fetch(`/api/catalog/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: cat.position }),
      });
    }
  };

  const onDragEndItems = async (result: DropResult) => {
    if (!result.destination || !selectedCat) return;
    const reordered = reorder(selectedCat.items, result.source.index, result.destination.index)
      .map((item, i) => ({ ...item, position: i }));
    setCategories((cats) => cats.map((c) => c.id === selectedId ? { ...c, items: reordered } : c));
    for (const item of reordered) {
      await fetch(`/api/catalog/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: item.position }),
      });
    }
  };

  const addCategory = async () => {
    if (!newCatTitle.trim()) return;
    const res = await fetch('/api/catalog/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCatTitle.trim(), slug: slugify(newCatTitle.trim()) }),
    });
    const cat = await res.json();
    setCategories((prev) => [...prev, cat]);
    setSelectedId(cat.id);
    setNewCatTitle('');
  };

  const deleteCategory = async (id: number) => {
    if (!window.confirm('Excluir categoria e todos os seus itens?')) return;
    await fetch(`/api/catalog/categories/${id}`, { method: 'DELETE' });
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(categories.find((c) => c.id !== id)?.id ?? null);
  };

  const addItem = async () => {
    if (!selectedCat || !newItem.title.trim() || !newItem.price) return;
    const res = await fetch('/api/catalog/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: selectedCat.id,
        slug: slugify(newItem.title.trim()),
        title: newItem.title.trim(),
        description: newItem.description,
        price: parseFloat(newItem.price),
        duration: newItem.duration ? parseInt(newItem.duration) : null,
      }),
    });
    const item = await res.json();
    setCategories((cats) => cats.map((c) => c.id === selectedId ? { ...c, items: [...c.items, item] } : c));
    setNewItem({ title: '', description: '', price: '', duration: '' });
  };

  const saveItem = async () => {
    if (!editingItem) return;
    await fetch(`/api/catalog/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editingItem.title,
        slug: slugify(editingItem.title),
        description: editingItem.description,
        price: parseFloat(editingItem.price),
        duration: editingItem.duration,
      }),
    });
    setCategories((cats) => cats.map((c) =>
      c.id === selectedId ? { ...c, items: c.items.map((i) => i.id === editingItem.id ? editingItem : i) } : c
    ));
    setEditingItem(null);
  };

  const deleteItem = async (itemId: number) => {
    await fetch(`/api/catalog/items/${itemId}`, { method: 'DELETE' });
    setCategories((cats) => cats.map((c) =>
      c.id === selectedId ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c
    ));
  };

  const inputClass = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

  return (
    <div className="flex gap-6" style={{ minHeight: 400 }}>
      {/* Categorias */}
      <div className="w-56 shrink-0">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">Categorias</h3>
        <DragDropContext onDragEnd={(r) => void onDragEndCategories(r)}>
          <Droppable droppableId="categories">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                {categories.map((cat, index) => (
                  <Draggable key={cat.id} draggableId={String(cat.id)} index={index}>
                    {(drag) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        {...drag.dragHandleProps}
                        onClick={() => setSelectedId(cat.id)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm cursor-pointer transition ${selectedId === cat.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      >
                        <span className="truncate">{cat.title}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void deleteCategory(cat.id); }}
                          className={`ml-1 text-xs ${selectedId === cat.id ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-rose-500'}`}
                        >×</button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <div className="mt-3 flex gap-1">
          <input
            className="flex-1 rounded-xl border border-slate-300 px-2 py-1 text-sm outline-none focus:border-sky-500"
            placeholder="Nova categoria"
            value={newCatTitle}
            onChange={(e) => setNewCatTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addCategory(); }}
          />
          <button onClick={() => void addCategory()} className="rounded-xl bg-slate-950 px-2 text-white text-lg">+</button>
        </div>
      </div>

      {/* Itens */}
      <div className="flex-1">
        {selectedCat ? (
          <>
            <h3 className="mb-3 text-sm font-semibold text-slate-700 uppercase tracking-wide">{selectedCat.title}</h3>
            <DragDropContext onDragEnd={(r) => void onDragEndItems(r)}>
              <Droppable droppableId="items">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 mb-4">
                    {selectedCat.items.map((item, index) => (
                      <Draggable key={item.id} draggableId={String(item.id)} index={index}>
                        {(drag) => (
                          <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                          >
                            {editingItem?.id === item.id ? (
                              <div className="space-y-2">
                                <input className={inputClass} value={editingItem.title} onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })} placeholder="Título" />
                                <textarea className={inputClass} rows={2} value={editingItem.description} onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })} placeholder="Descrição" />
                                <div className="flex gap-2">
                                  <input className={inputClass} type="number" step="0.01" value={editingItem.price} onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })} placeholder="Preço (R$)" />
                                  <input className={inputClass} type="number" value={editingItem.duration ?? ''} onChange={(e) => setEditingItem({ ...editingItem, duration: e.target.value ? parseInt(e.target.value) : null })} placeholder="Duração (min)" />
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => void saveItem()} className="rounded-xl bg-slate-950 px-3 py-1 text-xs text-white">Salvar</button>
                                  <button onClick={() => setEditingItem(null)} className="rounded-xl border border-slate-300 px-3 py-1 text-xs text-slate-600">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                                  <p className="text-xs text-slate-500">R$ {parseFloat(item.price).toFixed(2)}{item.duration ? ` • ${item.duration} min` : ''}</p>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => setEditingItem(item)} className="text-xs text-sky-600 hover:text-sky-700">Editar</button>
                                  <button onClick={() => void deleteItem(item.id)} className="text-xs text-rose-500 hover:text-rose-600">Remover</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>

            {/* Novo item */}
            <div className="rounded-2xl border border-dashed border-slate-300 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase">Novo item</p>
              <input className={inputClass} placeholder="Título" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
              <textarea className={inputClass} rows={2} placeholder="Descrição" value={newItem.description} onChange={(e) => setNewItem({ ...newItem, description: e.target.value })} />
              <div className="flex gap-2">
                <input className={inputClass} type="number" step="0.01" placeholder="Preço (R$)" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
                <input className={inputClass} type="number" placeholder="Duração (min)" value={newItem.duration} onChange={(e) => setNewItem({ ...newItem, duration: e.target.value })} />
              </div>
              <button onClick={() => void addItem()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Adicionar item</button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 mt-8 text-center">Selecione ou crie uma categoria</p>
        )}
      </div>
    </div>
  );
}
