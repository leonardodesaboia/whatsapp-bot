import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import ContactsSettings from '@/components/ContactsSettings';

export default async function ContatosPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: contacts }, { rows: leads }, { rows: stages }] = await Promise.all([
    pool.query('SELECT * FROM contacts ORDER BY name ASC'),
    pool.query('SELECT id, phone, name, stage_id FROM leads ORDER BY name ASC'),
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Contatos (Broadcast)</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <ContactsSettings initialContacts={contacts} leads={leads} stages={stages} />
      </div>
    </main>
  );
}
