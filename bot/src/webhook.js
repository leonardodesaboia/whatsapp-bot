const { getHistory, appendHistory } = require('./redis');
const { chat } = require('./openai');
const { sendText } = require('./evolutionApi');
const { getState, setState, clearState, setHumanMode, isHumanMode } = require('./state');
const { isOpen, getClosedMessage } = require('./businessHours');
const { sendNotification } = require('./notify');
const { handleCatalogFlow } = require('./catalog');
const { handleSchedulingFlow } = require('./scheduling');
const { handlePaymentFlow } = require('./payment');
const { transcribeAudio } = require('./audio');
const { handleImageMessage } = require('./image');
const { sendBroadcast } = require('./broadcast');
const { upsertLead, addInteraction } = require('./crm');
const { cancelEnrollment } = require('./remarketing');

const STARTUP_TIMESTAMP = process.env.NODE_ENV === 'production' ? 0 : Math.floor(Date.now() / 1000);

function isPrivateChat(remoteJid) {
  return typeof remoteJid === 'string' && remoteJid.endsWith('@s.whatsapp.net');
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

  if (cmd === '/broadcast' && args.length >= 1) {
    const message = args.join(' ');
    (async () => {
      try {
        await sendBroadcast(message);
      } catch (err) {
        console.error('Erro no broadcast:', err.message);
      }
    })();
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
  if (state.flow === 'scheduling') {
    await handleSchedulingFlow(phone, state, text);
    return null;
  }
  if (state.flow === 'payment') {
    await handlePaymentFlow(phone, state, text);
    return null;
  }

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
  if (reply === '__SCHEDULE__') {
    await setState(phone, { flow: 'scheduling', step: 0, data: {} });
    await handleSchedulingFlow(phone, { flow: 'scheduling', step: 0, data: {} }, text);
    return null;
  }
  if (reply?.startsWith('__PAYMENT__:')) {
    const parts = reply.split(':');
    const amount = parseFloat(parts[1]);
    const description = parts.slice(2).join(':');
    if (!Number.isFinite(amount) || amount <= 0 || !description.trim()) {
      return 'Desculpe, não consegui identificar o valor do pagamento. Informe o valor e a descrição novamente.';
    }
    const newState = { flow: 'payment', step: 0, data: { amount, description } };
    await setState(phone, newState);
    await handlePaymentFlow(phone, newState, text);
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
  console.log('[startup-filter] ts:', data.messageTimestamp, 'startup:', STARTUP_TIMESTAMP);
  if (data.messageTimestamp && data.messageTimestamp < STARTUP_TIMESTAMP) return res.sendStatus(200);

  const text = extractMessage(data);
  const hasAudio = !text && !!data.message?.audioMessage;
  const hasImage = !text && !!data.message?.imageMessage;

  if (!text && !hasAudio && !hasImage) return res.sendStatus(200);

  const phone = data.key.remoteJid.replace('@s.whatsapp.net', '');
  const messageType = hasImage ? 'image' : hasAudio ? 'audio' : 'text';
  const incomingContent = text || (hasAudio ? '[áudio]' : '[imagem]');
  const pushName = data.pushName || null;

  void cancelEnrollment(phone);

  if (await isHumanMode(phone)) return res.sendStatus(200);

  if (!await isOpen()) {
    res.sendStatus(200);
    (async () => {
      try {
        await upsertLead(phone, pushName, incomingContent, messageType);
        await addInteraction(phone, incomingContent, 'in', messageType);
        const closedMsg = await getClosedMessage();
        await sendText(phone, closedMsg);
        await addInteraction(phone, closedMsg, 'out', 'text');
      } catch (err) {
        console.error('Erro ao responder fora do horário:', err.message);
      }
    })();
    return;
  }

  res.sendStatus(200);

  (async () => {
    try {
      await upsertLead(phone, pushName, incomingContent, messageType);
      await addInteraction(phone, incomingContent, 'in', messageType);

      if (hasImage) {
        await handleImageMessage(phone, data);
        return;
      }

      let messageText = text;
      if (hasAudio) {
        messageText = await transcribeAudio(data);
        if (!messageText) return;
      }

      const reply = await processMessage(phone, messageText);
      if (reply) {
        await sendText(phone, reply);
        await addInteraction(phone, reply, 'out', 'text');
      }
    } catch (err) {
      console.error('Erro ao processar mensagem:', err.message);
    }
  })();
}

module.exports = { handleWebhook, isPrivateChat, extractMessage, parseCommand };
