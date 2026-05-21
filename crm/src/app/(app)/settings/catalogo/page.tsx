import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPool } from '@/lib/db';
import CatalogSettings from '@/components/CatalogSettings';

export default async function CatalogoPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const pool = getPool();
  const [{ rows: categories }, { rows: items }] = await Promise.all([
    pool.query('SELECT * FROM catalog_categories ORDER BY position ASC'),
    pool.query('SELECT * FROM catalog_items ORDER BY position ASC'),
  ]);

  const catalogWithItems = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  return (
    <main className="px-6 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Configurações</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-950">Catálogo</h1>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CatalogSettings initialCategories={catalogWithItems} />
      </div>
    </main>
  );
}
