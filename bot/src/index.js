require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');
const { handlePaymentWebhook } = require('./payment');
const { sendNotification } = require('./notify');
const { rescheduleAllReminders } = require('./scheduling');
const { sendBroadcast, loadContacts } = require('./broadcast');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/notify', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }
  try {
    await sendNotification(phone, message);
    res.json({ sent: true });
  } catch (err) {
    console.error('Erro ao enviar notificação:', err.message);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.post('/broadcast', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }
  const contacts = loadContacts();
  res.json({ queued: contacts.length });
  (async () => {
    try {
      await sendBroadcast(message);
    } catch (err) {
      console.error('Erro no broadcast via HTTP:', err.message);
    }
  })();
});

app.post('/payment/webhook', async (req, res) => {
  try {
    const status = req.query['data.status'] || req.body?.status;
    await handlePaymentWebhook(req.body, status);
    res.sendStatus(200);
  } catch (err) {
    console.error('Erro ao processar webhook de pagamento:', err.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);

  try {
    await rescheduleAllReminders();
    console.log('Lembretes pendentes reagendados.');
  } catch (err) {
    console.warn('Aviso: não foi possível reagendar lembretes.', err.message);
  }

  const botUrl = process.env.BOT_WEBHOOK_URL || `http://bot:${PORT}`;
  try {
    await registerWebhook(botUrl);
    console.log(`Webhook registrado em ${botUrl}/webhook`);
  } catch (err) {
    console.warn('Aviso: não foi possível registrar webhook automaticamente.', err.message);
    console.warn(`Registre manualmente: PUT ${process.env.EVOLUTION_API_URL}/webhook/set/${process.env.EVOLUTION_INSTANCE}`);
  }
});
