const axios = require('axios');

const BASE_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE;
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN;

async function sendText(to, text) {
  await axios.post(
    `${BASE_URL}/message/sendText/${INSTANCE}`,
    { number: to, text },
    { headers: { apikey: API_KEY } }
  );
}

async function registerWebhook(botPublicUrl) {
  await axios.put(
    `${BASE_URL}/webhook/set/${INSTANCE}`,
    {
      enabled: true,
      url: `${botPublicUrl}/webhook`,
      headers: { 'x-api-key': WEBHOOK_TOKEN },
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
    { headers: { apikey: API_KEY } }
  );
}

async function sendList(to, listMessage) {
  await axios.post(
    `${BASE_URL}/message/sendList/${INSTANCE}`,
    { number: to, ...listMessage },
    { headers: { apikey: API_KEY } }
  );
}

async function sendImageBase64(to, base64, caption) {
  await axios.post(
    `${BASE_URL}/message/sendMedia/${INSTANCE}`,
    {
      number: to,
      mediatype: 'image',
      mimetype: 'image/png',
      media: base64,
      caption: caption || '',
    },
    { headers: { apikey: API_KEY } }
  );
}

module.exports = { sendText, registerWebhook, sendList, sendImageBase64 };
