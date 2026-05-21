'use client';

import { useState } from 'react';
import { Send, BotOff, BotMessageSquare } from 'lucide-react';

export default function LeadActions({ phone }: { phone: string }) {
  const [notifyMsg, setNotifyMsg] = useState('');
  const [sendingNotify, setSendingNotify] = useState(false);
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [activatingBot, setActivatingBot] = useState(false);
  const [botResult, setBotResult] = useState<string | null>(null);

  const showResult = (setter: (v: string | null) => void, msg: string) => {
    setter(msg);
    setTimeout(() => setter(null), 3000);
  };

  const sendNotify = async () => {
    if (!notifyMsg.trim()) return;
    setSendingNotify(true);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message: notifyMsg.trim() }),
      });
      showResult(setNotifyResult, res.ok ? 'Mensagem enviada!' : 'Erro ao enviar.');
      if (res.ok) setNotifyMsg('');
    } catch {
      showResult(setNotifyResult, 'Erro ao conectar com o bot.');
    }
    setSendingNotify(false);
  };

  const activateBot = async () => {
    setActivatingBot(true);
    try {
      const res = await fetch('/api/bot-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      showResult(setBotResult, res.ok ? 'Bot reativado!' : 'Erro ao reativar.');
    } catch {
      showResult(setBotResult, 'Erro ao conectar com o bot.');
    }
    setActivatingBot(false);
  };

  return (
    <div className="space-y-4">
      {/* Enviar mensagem */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-500">Enviar mensagem proativa</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder="Mensagem..."
            value={notifyMsg}
            onChange={(e) => setNotifyMsg(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void sendNotify(); }}
          />
          <button
            onClick={() => void sendNotify()}
            disabled={sendingNotify || !notifyMsg.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            <Send size={13} strokeWidth={2} />
            {sendingNotify ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {notifyResult && (
          <p className={`text-xs ${notifyResult.startsWith('Erro') ? 'text-rose-500' : 'text-emerald-600'}`}>
            {notifyResult}
          </p>
        )}
      </div>

      {/* Reativar bot */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <BotOff size={14} strokeWidth={2} className="text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">Reativar bot</p>
            <p className="text-xs text-slate-400">Encerra pausa e bot volta a responder</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {botResult && (
            <span className={`text-xs ${botResult.startsWith('Erro') ? 'text-rose-500' : 'text-emerald-600'}`}>
              {botResult}
            </span>
          )}
          <button
            onClick={() => void activateBot()}
            disabled={activatingBot}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <BotMessageSquare size={13} strokeWidth={2} />
            {activatingBot ? 'Ativando…' : 'Reativar'}
          </button>
        </div>
      </div>
    </div>
  );
}
