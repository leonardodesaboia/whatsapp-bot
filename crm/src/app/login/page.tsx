'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError('Email ou senha incorretos.');
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen px-6 py-12 flex items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur">
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">
            CRM
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">
            Entrar no funil
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Acesse o painel para acompanhar leads e oportunidades.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              required
            />
          </div>

          {error ? <p className="text-sm text-rose-500">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}

