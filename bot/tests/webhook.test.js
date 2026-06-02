jest.mock('../src/redis', () => ({
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
  getClient: jest.fn(),
}));
jest.mock('../src/openai', () => ({ chat: jest.fn() }));
jest.mock('../src/evolutionApi', () => ({
  sendText: jest.fn(),
  sendList: jest.fn(),
  registerWebhook: jest.fn(),
}));
jest.mock('../src/state', () => ({
  getState: jest.fn(),
  setState: jest.fn(),
  clearState: jest.fn(),
  setHumanMode: jest.fn(),
  isHumanMode: jest.fn(),
}));
jest.mock('../src/businessHours', () => ({
  isOpen: jest.fn(),
  getClosedMessage: jest.fn(),
}));
jest.mock('../src/notify', () => ({ sendNotification: jest.fn() }));
jest.mock('../src/catalog', () => ({ handleCatalogFlow: jest.fn() }));
jest.mock('../src/scheduling', () => ({ handleSchedulingFlow: jest.fn() }));
jest.mock('../src/payment', () => ({ handlePaymentFlow: jest.fn() }));
jest.mock('../src/audio', () => ({ transcribeAudio: jest.fn() }));
jest.mock('../src/image', () => ({ handleImageMessage: jest.fn() }));
jest.mock('../src/broadcast', () => ({
  sendBroadcast: jest.fn(),
  loadContacts: jest.fn(),
}));
jest.mock('../src/crm', () => ({
  upsertLead: jest.fn(),
  addInteraction: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { handleWebhook, isPrivateChat, extractMessage, parseCommand } = require('../src/webhook');
const { getHistory, appendHistory } = require('../src/redis');
const { chat } = require('../src/openai');
const { sendText } = require('../src/evolutionApi');
const { isHumanMode, setHumanMode, getState, setState, clearState } = require('../src/state');
const { isOpen, getClosedMessage } = require('../src/businessHours');
const { sendNotification } = require('../src/notify');
const { handleCatalogFlow } = require('../src/catalog');
const { handleSchedulingFlow } = require('../src/scheduling');
const { handlePaymentFlow } = require('../src/payment');
const { transcribeAudio } = require('../src/audio');
const { handleImageMessage } = require('../src/image');
const { sendBroadcast, loadContacts } = require('../src/broadcast');
const { upsertLead, addInteraction } = require('../src/crm');

process.env.WEBHOOK_TOKEN = 'test-token';

const app = express();
app.use(express.json());
app.post('/webhook', handleWebhook);
app.post('/webhook/:event', handleWebhook);

const validPayload = {
  event: 'messages.upsert',
  data: {
    key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-123' },
    message: { conversation: 'Qual o horário de atendimento?' },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  isHumanMode.mockResolvedValue(false);
  isOpen.mockReturnValue(true);
  getState.mockResolvedValue({ mode: 'bot', flow: null, step: 0, data: {} });
  handleSchedulingFlow.mockResolvedValue(undefined);
  handlePaymentFlow.mockResolvedValue(undefined);
  transcribeAudio.mockResolvedValue(null);
  handleImageMessage.mockResolvedValue(undefined);
  sendBroadcast.mockResolvedValue({ sent: 2, failed: 0 });
  loadContacts.mockReturnValue([{ phone: '5511111111111' }, { phone: '5511222222222' }]);
  upsertLead.mockResolvedValue(undefined);
  addInteraction.mockResolvedValue(undefined);
});

test('retorna 401 sem token válido', async () => {
  await request(app).post('/webhook').send(validPayload).expect(401);
});

test('retorna 401 com token errado', async () => {
  await request(app).post('/webhook').set('x-api-key', 'errado').send(validPayload).expect(401);
});

test('ignora mensagens de grupos', async () => {
  const payload = { ...validPayload, data: { ...validPayload.data, key: { ...validPayload.data.key, remoteJid: '123@g.us' } } };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora eventos que não são messages.upsert', async () => {
  const payload = { ...validPayload, event: 'connection.update' };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('aceita webhook com sufixo de evento da Evolution API', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Olá!');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook/messages-upsert').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(chat).toHaveBeenCalledWith([], 'Qual o horário de atendimento?');
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Olá!');
});

test('ignora payload com key sem remoteJid', async () => {
  const payload = {
    ...validPayload,
    data: { ...validPayload.data, key: { fromMe: false, id: 'msg-123' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('processa comando /bot on de mensagem fromMe', async () => {
  clearState.mockResolvedValue(undefined);
  sendNotification.mockResolvedValue(undefined);
  const payload = {
    ...validPayload,
    data: { key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: '/bot on 5511888888888' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(clearState).toHaveBeenCalledWith('5511888888888');
  expect(sendNotification).toHaveBeenCalledWith('5511888888888', expect.stringContaining('assistente virtual'));
});

test('processa comando /notify de mensagem fromMe', async () => {
  sendNotification.mockResolvedValue(undefined);
  const payload = {
    ...validPayload,
    data: { key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' }, message: { conversation: '/notify 5511888888888 Seu pedido chegou!' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(sendNotification).toHaveBeenCalledWith('5511888888888', 'Seu pedido chegou!');
});

test('ignora mensagem quando bot está em modo humano', async () => {
  isHumanMode.mockResolvedValue(true);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 50));
  expect(chat).not.toHaveBeenCalled();
});

test('responde com closedMessage quando fora do horário', async () => {
  isOpen.mockReturnValue(false);
  getClosedMessage.mockReturnValue('Estamos fechados!');
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(upsertLead).toHaveBeenCalledWith(
    '5511999999999',
    null,
    'Qual o horário de atendimento?',
    'text'
  );
  expect(addInteraction).toHaveBeenCalledWith(
    '5511999999999',
    'Qual o horário de atendimento?',
    'in',
    'text'
  );
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Estamos fechados!');
  expect(addInteraction).toHaveBeenCalledWith('5511999999999', 'Estamos fechados!', 'out', 'text');
  expect(chat).not.toHaveBeenCalled();
});

test('roteia para handleCatalogFlow quando flow=catalog', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'catalog', step: 1, data: {} });
  handleCatalogFlow.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleCatalogFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'catalog' }), 'Qual o horário de atendimento?');
});

test('processa mensagem válida com OpenAI e envia resposta', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Atendemos das 9h às 18h.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(chat).toHaveBeenCalledWith([], 'Qual o horário de atendimento?');
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Atendemos das 9h às 18h.');
});

test('chama upsertLead e addInteraction (in/out) quando mensagem de texto chega', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Olá!');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(upsertLead).toHaveBeenCalledWith(
    '5511999999999',
    null,
    'Qual o horário de atendimento?',
    'text'
  );
  expect(addInteraction).toHaveBeenCalledWith(
    '5511999999999',
    'Qual o horário de atendimento?',
    'in',
    'text'
  );
  expect(addInteraction).toHaveBeenCalledWith('5511999999999', 'Olá!', 'out', 'text');
});

test('chama upsertLead com pushName quando disponível', async () => {
  const payloadWithName = {
    ...validPayload,
    data: { ...validPayload.data, pushName: 'João Silva' },
  };
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Olá!');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payloadWithName).expect(200);
  await new Promise((r) => setTimeout(r, 100));

  expect(upsertLead).toHaveBeenCalledWith(
    '5511999999999',
    'João Silva',
    'Qual o horário de atendimento?',
    'text'
  );
});

test('detecta __TRANSFER__ e ativa modo humano', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__TRANSFER__');
  setHumanMode.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setHumanMode).toHaveBeenCalledWith('5511999999999');
  expect(sendText).toHaveBeenCalledWith('5511999999999', expect.stringContaining('atendente'));
});

test('detecta __CATALOG__ e inicia flow de catálogo', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__CATALOG__');
  setState.mockResolvedValue(undefined);
  handleCatalogFlow.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', { flow: 'catalog', step: 0, data: {} });
  expect(handleCatalogFlow).toHaveBeenCalled();
});

test('isPrivateChat identifica chat privado', () => {
  expect(isPrivateChat('5511999999999@s.whatsapp.net')).toBe(true);
  expect(isPrivateChat('123456@g.us')).toBe(false);
});

test('parseCommand retorna null para texto sem /', () => {
  expect(parseCommand('oi')).toBeNull();
  expect(parseCommand(null)).toBeNull();
});

test('parseCommand retorna cmd e args para comando válido', () => {
  expect(parseCommand('/bot on 5511999999999')).toEqual({ cmd: '/bot', args: ['on', '5511999999999'] });
});

test('extractMessage lê de conversation', () => {
  expect(extractMessage({ message: { conversation: 'oi' } })).toBe('oi');
});

test('extractMessage lê de extendedTextMessage', () => {
  expect(extractMessage({ message: { extendedTextMessage: { text: 'oi' } } })).toBe('oi');
});

test('extractMessage retorna null para tipos não suportados', () => {
  expect(extractMessage({ message: { imageMessage: {} } })).toBeNull();
});

test('extractMessage lê selectedRowId de listResponseMessage', () => {
  const data = { message: { listResponseMessage: { singleSelectReply: { selectedRowId: 'services' } } } };
  expect(extractMessage(data)).toBe('services');
});

test('extractMessage lê título de listMessage (bot enviando lista)', () => {
  const data = { message: { listMessage: { title: 'O que você procura?' } } };
  expect(extractMessage(data)).toBe('[lista: O que você procura?]');
});

test('roteia para handleSchedulingFlow com contactName quando flow=scheduling', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'scheduling', step: 1, data: {} });
  const payloadWithName = {
    ...validPayload,
    data: { ...validPayload.data, pushName: 'João Silva' },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payloadWithName).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleSchedulingFlow).toHaveBeenCalledWith(
    '5511999999999',
    expect.objectContaining({
      flow: 'scheduling',
      data: expect.objectContaining({ contactName: 'João Silva' }),
    }),
    'Qual o horário de atendimento?'
  );
});

test('roteia para handlePaymentFlow quando flow=payment', async () => {
  getState.mockResolvedValue({ mode: 'bot', flow: 'payment', step: 1, data: {} });
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handlePaymentFlow).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'payment' }), 'Qual o horário de atendimento?');
});

test('detecta __SCHEDULE__ e inicia flow de agendamento', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__SCHEDULE__');
  setState.mockResolvedValue(undefined);
  const payloadWithName = {
    ...validPayload,
    data: { ...validPayload.data, pushName: 'João Silva' },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payloadWithName).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', {
    flow: 'scheduling',
    step: 0,
    data: { contactName: 'João Silva' },
  });
  expect(handleSchedulingFlow).toHaveBeenCalledWith(
    '5511999999999',
    expect.objectContaining({ data: { contactName: 'João Silva' } }),
    'Qual o horário de atendimento?'
  );
});

test('detecta __PAYMENT__ e inicia flow de pagamento', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__PAYMENT__:50.00:Corte de cabelo');
  setState.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(setState).toHaveBeenCalledWith('5511999999999', expect.objectContaining({ flow: 'payment', data: { amount: 50, description: 'Corte de cabelo' } }));
  expect(handlePaymentFlow).toHaveBeenCalled();
});

test('trata __PAYMENT__ inválido sem quebrar o fluxo', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('__PAYMENT__:abc:');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(validPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handlePaymentFlow).not.toHaveBeenCalled();
  expect(sendText).toHaveBeenCalledWith(
    '5511999999999',
    expect.stringContaining('não consegui identificar o valor do pagamento')
  );
});

test('transcreve áudio e processa como texto normal', async () => {
  const audioPayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-audio' },
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } },
    },
  };
  transcribeAudio.mockResolvedValue('quero agendar um horário');
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Claro! Vamos agendar.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(audioPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(transcribeAudio).toHaveBeenCalledWith(audioPayload.data);
  expect(upsertLead).toHaveBeenCalledWith('5511999999999', null, '[áudio]', 'audio');
  expect(addInteraction).toHaveBeenCalledWith('5511999999999', '[áudio]', 'in', 'audio');
  expect(chat).toHaveBeenCalledWith([], 'quero agendar um horário');
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Claro! Vamos agendar.');
});

test('ignora mensagem de áudio quando transcrição retorna null', async () => {
  const audioPayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-audio' },
      message: { audioMessage: {} },
    },
  };
  transcribeAudio.mockResolvedValue(null);
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(audioPayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(chat).not.toHaveBeenCalled();
});

test('roteia imagem para handleImageMessage sem chamar OpenAI', async () => {
  const imagePayload = {
    event: 'messages.upsert',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'msg-img' },
      message: { imageMessage: { caption: 'O que é isso?' } },
    },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(imagePayload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(handleImageMessage).toHaveBeenCalledWith('5511999999999', imagePayload.data);
  expect(chat).not.toHaveBeenCalled();
});

test('processa comando /broadcast de mensagem fromMe', async () => {
  const payload = {
    ...validPayload,
    data: {
      key: { fromMe: true, remoteJid: '5511999999999@s.whatsapp.net' },
      message: { conversation: '/broadcast Promoção especial!' },
    },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  await new Promise((r) => setTimeout(r, 100));
  expect(sendBroadcast).toHaveBeenCalledWith('Promoção especial!');
});
