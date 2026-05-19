const { getHistory, appendHistory } = require('./redis');
const { chat } = require('./openai');
const { sendText } = require('./evolutionApi');

function isPrivateChat(remoteJid) {
  return remoteJid.endsWith('@s.whatsapp.net');
}

function extractMessage(data) {
  const msg = data.message;
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    null
  );
}

async function handleWebhook(req, res) {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;

  if (event !== 'messages.upsert') return res.sendStatus(200);
  if (!data?.key) return res.sendStatus(200);
  if (data.key.fromMe) return res.sendStatus(200);
  if (!isPrivateChat(data.key.remoteJid)) return res.sendStatus(200);

  const text = extractMessage(data);
  if (!text) return res.sendStatus(200);

  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');

  // responde à Evolution API imediatamente para evitar timeout
  res.sendStatus(200);

  // processa de forma assíncrona
  (async () => {
    try {
      const history = await getHistory(phone);
      const reply = await chat(history, text);
      await appendHistory(phone, text, reply);
      await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
}

module.exports = { handleWebhook, isPrivateChat, extractMessage };
