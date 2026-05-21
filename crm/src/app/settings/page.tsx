import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import StageManager from '@/components/StageManager';
import CompanySettings from '@/components/CompanySettings';
import CatalogSettings from '@/components/CatalogSettings';
import ContactsSettings from '@/components/ContactsSettings';

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();

  const [
    { rows: stages },
    { rows: companyRows },
    { rows: categories },
    { rows: items },
    { rows: contacts },
    { rows: leads },
  ] = await Promise.all([
    pool.query('SELECT * FROM stages ORDER BY position ASC'),
    pool.query('SELECT * FROM company_settings LIMIT 1'),
    pool.query('SELECT * FROM catalog_categories ORDER BY position ASC'),
    pool.query('SELECT * FROM catalog_items ORDER BY position ASC'),
    pool.query('SELECT * FROM contacts ORDER BY name ASC'),
    pool.query('SELECT id, phone, name, stage_id FROM leads ORDER BY name ASC'),
  ]);

  const catalogWithItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-sky-600 transition hover:text-sky-700">
          ← Voltar ao funil
        </Link>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Configurações</h1>
      </div>

      <div className="space-y-6">
        {/* Empresa + Horário + FAQ */}
        <CompanySettings initial={companyRows[0] ?? null} />

        {/* Etapas do funil */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Etapas do funil</h2>
          <StageManager initialStages={stages} />
        </section>

        {/* Catálogo */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Catálogo</h2>
          <CatalogSettings initialCategories={catalogWithItems} />
        </section>

        {/* Contatos broadcast */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Contatos (Broadcast)</h2>
          <ContactsSettings initialContacts={contacts} leads={leads} stages={stages} />
        </section>
      </div>
    </main>
  );
}
