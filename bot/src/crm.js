const { Pool } = require('pg');

let _pool;

function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

async function upsertLead(phone, name, lastMessage) {
  try {
    const pool = getPool();
    const stageRes = await pool.query('SELECT id FROM stages ORDER BY position ASC LIMIT 1', []);
    const stageId = stageRes.rows[0]?.id ?? null;
    await pool.query(
      `INSERT INTO leads (phone, name, last_message, last_seen_at, stage_id)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT (phone) DO UPDATE SET
         name = COALESCE(leads.name, EXCLUDED.name),
         stage_id = COALESCE(leads.stage_id, EXCLUDED.stage_id),
         last_message = EXCLUDED.last_message,
         last_seen_at = NOW(),
         updated_at = NOW()`,
      [phone, name || null, lastMessage, stageId]
    );
  } catch (err) {
    console.error('CRM upsertLead error:', err.message);
  }
}

async function addInteraction(phone, content, direction, type) {
  try {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO interactions (lead_id, content, direction, type)
       SELECT id, $2, $3, $4 FROM leads WHERE phone = $1`,
      [phone, content, direction, type]
    );
    if (result.rowCount === 0) {
      console.warn('CRM addInteraction: no lead found for phone', phone);
    }
  } catch (err) {
    console.error('CRM addInteraction error:', err.message);
  }
}

module.exports = { upsertLead, addInteraction };
