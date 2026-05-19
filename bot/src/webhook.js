const { getHistory, appendHistory } = require('./redis');
const { chat } = require('./openai');
const { sendText } = require('./evolutionApi');
const { getState, setState, clearState, setHumanMode, isHumanMode } = require('./state');
const { isOpen, getClosedMessage } = require('./businessHours');
const { sendNotification } = require('./notify');
const { handleCatalogFlow } = require('./catalog');

function isPrivateChat(remoteJid) {
  return remoteJid.endsWith('@s.whatsapp.net');
}

function extractMessage(data) {
  const msg = data?.message;
  if (!msg) return null;
  return msg.conversation || msg.extendedTextMessage?.text || null;
}

function parseCommand(text) {
  if (!text?.startsWith('/')) return null;
  const [cmd, ...args] = text.trim().split(/\s+/);
  return { cmd: cmd.toLowerCase(), args };
}

async function handleCommand(parsed, res) {
  const { cmd, args } = parsed;

  if (cmd === '/bot' && args[0] === 'on' && args[1]) {
    await clearState(args[1]);
    await sendNotification(args[1], 'Você está novamente com o assistente virtual. Como posso ajudar?');
    return res.json({ ok: true });
  }

  if (cmd === '/notify' && args.length >= 2) {
    const phone = args[0];
    const message = args.slice(1).join(' ');
    await sendNotification(phone, message);
    return res.json({ ok: true });
  }

  return res.sendStatus(200);
}

async function processMessage(phone, text) {
  const state = await getState(phone);

  if (state.flow === 'catalog') {
    await handleCatalogFlow(phone, state, text);
    return null;
  }

  // flows de scheduling e payment serão adicionados na Parte 2
  const history = await getHistory(phone);
  const reply = await chat(history, text);

  if (reply === '__TRANSFER__') {
    await setHumanMode(phone);
    return 'Conectando você a um atendente. Aguarde um momento.';
  }
  if (reply === '__CATALOG__') {
    await setState(phone, { flow: 'catalog', step: 0, data: {} });
    await handleCatalogFlow(phone, { flow: 'catalog', step: 0, data: {} }, text);
    return null;
  }

  await appendHistory(phone, text, reply);
  return reply;
}

async function handleWebhook(req, res) {
  const token = req.headers['x-api-key'];
  if (token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, data } = req.body;

  if (data?.key?.fromMe) {
    const text = extractMessage(data);
    const command = parseCommand(text);
    if (command) return handleCommand(command, res);
    return res.sendStatus(200);
  }

  if (event !== 'messages.upsert') return res.sendStatus(200);
  if (!data?.key) return res.sendStatus(200);
  if (!isPrivateChat(data.key.remoteJid)) return res.sendStatus(200);

  const text = extractMessage(data);
  if (!text) return res.sendStatus(200);

  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');

  if (await isHumanMode(phone)) return res.sendStatus(200);

  if (!isOpen()) {
    res.sendStatus(200);
    (async () => {
      try {
        await sendText(phone, getClosedMessage());
      } catch (err) {
        console.error('Erro ao responder fora do horário:', err.message);
      }
    })();
    return;
  }

  res.sendStatus(200);

  (async () => {
    try {
      const reply = await processMessage(phone, text);
      if (reply) await sendText(phone, reply);
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
}

module.exports = { handleWebhook, isPrivateChat, extractMessage, parseCommand };
