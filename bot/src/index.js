require('dotenv').config();
const express = require('express');
const { handleWebhook } = require('./webhook');
const { registerWebhook } = require('./evolutionApi');

const app = express();
app.use(express.json());

app.post('/webhook', handleWebhook);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Bot rodando na porta ${PORT}`);
  const botUrl = process.env.BOT_WEBHOOK_URL || `http://bot:${PORT}`;
  try {
    await registerWebhook(botUrl);
    console.log(`Webhook registrado em ${botUrl}/webhook`);
  } catch (err) {
    console.warn('Aviso: não foi possível registrar webhook automaticamente.', err.message);
    console.warn(`Registre manualmente: PUT ${process.env.EVOLUTION_API_URL}/webhook/set/${process.env.EVOLUTION_INSTANCE}`);
  }
});
