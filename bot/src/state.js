const { getClient } = require('./redis');

const DEFAULT_STATE = { mode: 'bot', flow: null, step: 0, data: {} };

async function getState(phone) {
  const client = await getClient();
  const raw = await client.get(`state:${phone}`);
  return raw ? JSON.parse(raw) : { ...DEFAULT_STATE };
}

async function setState(phone, partial, ttl = 86400) {
  const client = await getClient();
  const current = await getState(phone);
  const next = { ...current, ...partial };
  await client.set(`state:${phone}`, JSON.stringify(next), { EX: ttl });
}

async function clearState(phone) {
  const client = await getClient();
  await client.del(`state:${phone}`);
}

async function setHumanMode(phone) {
  const mins = parseInt(process.env.HUMAN_TAKEOVER_TIMEOUT_MINUTES || '30', 10);
  await setState(phone, { mode: 'human', flow: null, step: 0, data: {} }, mins * 60);
}

async function isHumanMode(phone) {
  const state = await getState(phone);
  return state.mode === 'human';
}

module.exports = { getState, setState, clearState, setHumanMode, isHumanMode };
