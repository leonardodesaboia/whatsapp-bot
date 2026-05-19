const { createClient } = require('redis');

let _client;

async function getClient() {
  if (!_client) {
    const c = createClient({ url: process.env.REDIS_URL || 'redis://redis:6379' });
    await c.connect();
    _client = c;
  }
  return _client;
}

async function getHistory(phone) {
  const client = await getClient();
  const data = await client.get(`history:${phone}`);
  return data ? JSON.parse(data) : [];
}

async function appendHistory(phone, userMessage, assistantMessage) {
  const client = await getClient();
  const maxHistory = parseInt(process.env.MAX_HISTORY || '10', 10);
  const history = await getHistory(phone);
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: assistantMessage });
  const trimmed = history.slice(-maxHistory * 2);
  await client.set(`history:${phone}`, JSON.stringify(trimmed), { EX: 86400 });
}

module.exports = { getHistory, appendHistory, getClient };
