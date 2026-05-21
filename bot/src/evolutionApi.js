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
  await axios.post(
    `${BASE_URL}/webhook/set/${INSTANCE}`,
    {
      webhook: {
        enabled: true,
        url: `${botPublicUrl}/webhook`,
        headers: { 'x-api-key': WEBHOOK_TOKEN },
        webhookByEvents: true,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      },
    },
    { headers: { apikey: API_KEY } }
  );
}

async function sendList(to, listMessage) {
  try {
    await axios.post(
      `${BASE_URL}/message/sendList/${INSTANCE}`,
      { number: to, ...listMessage },
      { headers: { apikey: API_KEY } }
    );
  } catch (err) {
    console.error('sendList 400 body:', JSON.stringify(err.response?.data));
    throw err;
  }
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

async function getMediaBase64(messageData) {
  const response = await axios.post(
    `${BASE_URL}/chat/getBase64FromMediaMessage/${INSTANCE}`,
    { message: messageData },
    { headers: { apikey: API_KEY } }
  );
  return response.data.base64;
}

module.exports = { sendText, registerWebhook, sendList, sendImageBase64, getMediaBase64 };
