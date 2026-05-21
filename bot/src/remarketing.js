const { Pool } = require('pg');
const { sendText } = require('./evolutionApi');

let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

async function processRemarketing() {
  const pool = getPool();
  try {
    // Phase 1: Auto-enroll eligible leads
    const { rows: campaigns } = await pool.query(
      'SELECT * FROM remarketing_campaigns WHERE active = true'
    );

    for (const campaign of campaigns) {
      const { rows: eligible } = await pool.query(
        `SELECT l.id FROM leads l
         WHERE ($1::integer IS NULL OR l.stage_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM remarketing_enrollments e
           WHERE e.campaign_id = $2 AND e.lead_id = l.id
           AND e.completed_at IS NULL AND e.cancelled_at IS NULL
         )
         AND (
           NOT EXISTS (SELECT 1 FROM interactions i WHERE i.lead_id = l.id AND i.direction = 'in')
           OR (SELECT MAX(i.created_at) FROM interactions i WHERE i.lead_id = l.id AND i.direction = 'in')
              <= NOW() - ($3 * INTERVAL '1 day')
         )`,
        [campaign.stage_filter, campaign.id, campaign.trigger_days]
      );
      for (const lead of eligible) {
        await pool.query(
          'INSERT INTO remarketing_enrollments (campaign_id, lead_id) VALUES ($1, $2)',
          [campaign.id, lead.id]
        );
      }
    }

    // Phase 2: Process pending steps
    const { rows: enrollments } = await pool.query(
      `SELECT e.id, e.campaign_id, e.lead_id, e.current_step, e.last_sent_at, e.enrolled_at,
              l.phone, l.name
       FROM remarketing_enrollments e
       JOIN leads l ON l.id = e.lead_id
       JOIN remarketing_campaigns c ON c.id = e.campaign_id
       WHERE e.completed_at IS NULL AND e.cancelled_at IS NULL AND c.active = true`
    );

    for (const enrollment of enrollments) {
      const { rows: steps } = await pool.query(
        'SELECT * FROM remarketing_steps WHERE campaign_id = $1 ORDER BY position ASC',
        [enrollment.campaign_id]
      );
      if (steps.length === 0) continue;
      const step = steps[enrollment.current_step];
      if (!step) continue;

      const ref = enrollment.last_sent_at || enrollment.enrolled_at;
      const sendAt = new Date(ref);
      sendAt.setDate(sendAt.getDate() + step.delay_days);
      if (new Date() < sendAt) continue;

      const name = enrollment.name || 'cliente';
      const message = step.message.replace(/{{nome}}/g, name);

      try {
        await sendText(enrollment.phone, message);
      } catch (err) {
        console.error(`Erro ao enviar remarketing para ${enrollment.phone}:`, err.message);
        continue;
      }

      const nextStep = enrollment.current_step + 1;
      const isLast = nextStep >= steps.length;

      if (isLast) {
        await pool.query(
          'UPDATE remarketing_enrollments SET current_step = $1, last_sent_at = NOW(), completed_at = NOW() WHERE id = $2',
          [nextStep, enrollment.id]
        );
        await pool.query(
          "UPDATE leads SET tags = array_append(tags, 'sem-resposta'), updated_at = NOW() WHERE id = $1 AND NOT ('sem-resposta' = ANY(tags))",
          [enrollment.lead_id]
        );
      } else {
        await pool.query(
          'UPDATE remarketing_enrollments SET current_step = $1, last_sent_at = NOW() WHERE id = $2',
          [nextStep, enrollment.id]
        );
      }
    }
  } catch (err) {
    console.error('Erro ao processar remarketing:', err.message);
  }
}

async function cancelEnrollment(phone) {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE remarketing_enrollments SET cancelled_at = NOW()
       WHERE lead_id = (SELECT id FROM leads WHERE phone = $1)
       AND completed_at IS NULL AND cancelled_at IS NULL`,
      [phone]
    );
  } catch (err) {
    console.error('Erro ao cancelar enrollment de remarketing:', err.message);
  }
}

async function rescheduleRemarketing() {
  await processRemarketing();
  setInterval(() => { void processRemarketing(); }, 60 * 60 * 1000);
}

module.exports = { processRemarketing, cancelEnrollment, rescheduleRemarketing };
