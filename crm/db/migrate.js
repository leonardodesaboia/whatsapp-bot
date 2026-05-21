const { Pool } = require('pg');

async function migrate() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const targetUrl = new URL(DATABASE_URL);
  const dbName = targetUrl.pathname.slice(1);
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    const { rows } = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    if (rows.length === 0) {
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created.`);
    }
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7) NOT NULL DEFAULT '#6b7280',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255),
        stage_id INTEGER REFERENCES stages(id),
        assigned_to VARCHAR(255),
        products TEXT[] DEFAULT '{}',
        estimated_value DECIMAL(10,2),
        tags TEXT[] DEFAULT '{}',
        follow_up_at TIMESTAMPTZ,
        notes TEXT,
        last_message TEXT,
        last_seen_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS interactions (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        direction VARCHAR(3) NOT NULL,
        content TEXT NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'text',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS company_settings (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL DEFAULT '',
        descricao TEXT DEFAULT '',
        horario VARCHAR(255) DEFAULT '',
        contato VARCHAR(255) DEFAULT '',
        faq JSONB NOT NULL DEFAULT '[]',
        timezone VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
        business_hours JSONB DEFAULT NULL,
        closed_message TEXT DEFAULT '',
        CONSTRAINT only_one_row CHECK (id = 1)
      );

      CREATE TABLE IF NOT EXISTS catalog_categories (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS catalog_items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES catalog_categories(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        price DECIMAL(10,2) NOT NULL,
        duration INTEGER,
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE(category_id, slug)
      );

      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS remarketing_campaigns (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(255) NOT NULL,
        active       BOOLEAN NOT NULL DEFAULT true,
        trigger_days INTEGER NOT NULL DEFAULT 3,
        stage_filter INTEGER REFERENCES stages(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS remarketing_steps (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES remarketing_campaigns(id) ON DELETE CASCADE,
        position    INTEGER NOT NULL DEFAULT 0,
        delay_days  INTEGER NOT NULL DEFAULT 1,
        message     TEXT NOT NULL,
        UNIQUE(campaign_id, position)
      );

      CREATE TABLE IF NOT EXISTS remarketing_enrollments (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER NOT NULL REFERENCES remarketing_campaigns(id) ON DELETE CASCADE,
        lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        enrolled_at  TIMESTAMPTZ DEFAULT NOW(),
        last_sent_at TIMESTAMPTZ,
        current_step INTEGER NOT NULL DEFAULT 0,
        completed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ
      );
    `);
  } finally {
    await pool.end();
  }

  console.log('Migration complete.');
}

migrate().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
