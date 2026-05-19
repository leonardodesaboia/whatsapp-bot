const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: stageCount } = await pool.query('SELECT COUNT(*) FROM stages');
  if (parseInt(stageCount[0].count) === 0) {
    const stages = [
      { name: 'Lead', color: '#6b7280', position: 0 },
      { name: 'Qualificado', color: '#3b82f6', position: 1 },
      { name: 'Proposta', color: '#f59e0b', position: 2 },
      { name: 'Fechado', color: '#22c55e', position: 3 },
      { name: 'Perdido', color: '#ef4444', position: 4 },
    ];
    for (const s of stages) {
      await pool.query(
        'INSERT INTO stages (name, color, position) VALUES ($1, $2, $3)',
        [s.name, s.color, s.position]
      );
    }
    console.log('Default stages created.');
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    const { rows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3)',
        [email, hash, 'Admin']
      );
      console.log(`Admin user "${email}" created.`);
    }
  }

  await pool.end();
  console.log('Seed complete.');
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
