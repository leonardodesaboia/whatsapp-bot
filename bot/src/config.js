const { Pool } = require('pg');

let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

async function getCompanySettings() {
  const { rows } = await getPool().query('SELECT * FROM company_settings LIMIT 1');
  return rows[0] || null;
}

async function getCatalogCategories() {
  const pool = getPool();
  const { rows: categories } = await pool.query(
    'SELECT * FROM catalog_categories ORDER BY position ASC'
  );
  const { rows: items } = await pool.query(
    'SELECT * FROM catalog_items ORDER BY position ASC'
  );
  return categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));
}

async function getContacts() {
  const { rows } = await getPool().query(
    'SELECT phone, name FROM contacts ORDER BY name ASC'
  );
  return rows;
}

module.exports = { getCompanySettings, getCatalogCategories, getContacts };
