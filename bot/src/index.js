require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');
const {
  extractPaymentIdFromNotification,
  verifyWebhookSignature,
  handlePaymentWebhook,
} = require('./payment');
const { sendNotification } = require('./notify');
const { rescheduleAllReminders } = require('./scheduling');
const { sendBroadcast } = require('./broadcast');
const { rescheduleRemarketing } = require('./remarketing');
const { clearState } = require('./state');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);
app.post('/webhook/:event', handleWebhook);

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

app.post('/bot-pause', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  await setHumanMode(phone, null);
  res.json({ ok: true });
});

app.post('/bot-on', async (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  await clearState(phone);
  res.json({ ok: true });
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
  res.json({ queued: true });
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
    if (req.body?.type && req.body.type !== 'payment') {
      return res.sendStatus(200);
    }

    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (!secret) {
      console.error('MERCADOPAGO_WEBHOOK_SECRET não configurado.');
      return res.status(500).json({ error: 'Webhook secret is not configured' });
    }

    const paymentId = extractPaymentIdFromNotification(req.body, req.query);
    if (!paymentId) {
      return res.status(400).json({ error: 'Missing payment id' });
    }

    const isValidSignature = verifyWebhookSignature({
      secret,
      signatureHeader: req.headers['x-signature'],
      requestId: req.headers['x-request-id'],
      dataId: paymentId,
    });

    if (!isValidSignature) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    res.sendStatus(200);

    (async () => {
      try {
        await handlePaymentWebhook(req.body, req.query);
      } catch (err) {
        console.error('Erro ao processar webhook de pagamento:', err.message);
      }
    })();
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

  try {
    await rescheduleRemarketing();
    console.log('Remarketing inicializado.');
  } catch (err) {
    console.warn('Aviso: não foi possível inicializar remarketing.', err.message);
  }

  const botUrl = process.env.BOT_WEBHOOK_URL || `http://bot:${PORT}`;

  async function tryRegisterWebhook() {
    try {
      await registerWebhook(botUrl);
      console.log(`Webhook registrado em ${botUrl}/webhook`);
    } catch (err) {
      console.warn(`Webhook não registrado (${err.message}), tentando novamente em 30s...`);
      setTimeout(() => void tryRegisterWebhook(), 30000);
    }
  }

  void tryRegisterWebhook();
});
