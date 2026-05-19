jest.mock('../src/redis', () => ({
  getHistory: jest.fn(),
  appendHistory: jest.fn(),
}));
jest.mock('../src/openai', () => ({ chat: jest.fn() }));
jest.mock('../src/evolutionApi', () => ({ sendText: jest.fn() }));

const request = require('supertest');
const express = require('express');
const { handleWebhook, isPrivateChat, extractMessage } = require('../src/webhook');
const { getHistory, appendHistory } = require('../src/redis');
const { chat } = require('../src/openai');
const { sendText } = require('../src/evolutionApi');

process.env.WEBHOOK_TOKEN = 'test-token';

const app = express();
app.use(express.json());
app.post('/webhook', handleWebhook);

const validPayload = {
  event: 'messages.upsert',
  data: {
    key: {
      remoteJid: '5511999999999@s.whatsapp.net',
      fromMe: false,
      id: 'msg-123',
    },
    message: { conversation: 'Qual o horário de atendimento?' },
  },
};

beforeEach(() => jest.clearAllMocks());

test('retorna 401 sem token válido', async () => {
  await request(app).post('/webhook').send(validPayload).expect(401);
});

test('retorna 401 com token errado', async () => {
  await request(app)
    .post('/webhook')
    .set('x-api-key', 'token-errado')
    .send(validPayload)
    .expect(401);
});

test('ignora mensagem enviada pelo próprio número (fromMe)', async () => {
  const payload = {
    ...validPayload,
    data: { ...validPayload.data, key: { ...validPayload.data.key, fromMe: true } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora mensagens de grupos', async () => {
  const payload = {
    ...validPayload,
    data: { ...validPayload.data, key: { ...validPayload.data.key, remoteJid: '123456@g.us' } },
  };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('ignora eventos que não são messages.upsert', async () => {
  const payload = { ...validPayload, event: 'connection.update' };
  await request(app).post('/webhook').set('x-api-key', 'test-token').send(payload).expect(200);
  expect(chat).not.toHaveBeenCalled();
});

test('processa mensagem válida e envia resposta', async () => {
  getHistory.mockResolvedValue([]);
  chat.mockResolvedValue('Atendemos das 9h às 18h.');
  appendHistory.mockResolvedValue(undefined);
  sendText.mockResolvedValue(undefined);

  await request(app)
    .post('/webhook')
    .set('x-api-key', 'test-token')
    .send(validPayload)
    .expect(200);

  // aguarda o processamento assíncrono (fire-and-forget)
  await new Promise((r) => setTimeout(r, 100));

  expect(getHistory).toHaveBeenCalledWith('5511999999999');
  expect(chat).toHaveBeenCalledWith([], 'Qual o horário de atendimento?');
  expect(appendHistory).toHaveBeenCalledWith(
    '5511999999999',
    'Qual o horário de atendimento?',
    'Atendemos das 9h às 18h.'
  );
  expect(sendText).toHaveBeenCalledWith('5511999999999', 'Atendemos das 9h às 18h.');
});

test('isPrivateChat identifica chat privado', () => {
  expect(isPrivateChat('5511999999999@s.whatsapp.net')).toBe(true);
  expect(isPrivateChat('123456@g.us')).toBe(false);
});

test('extractMessage lê de conversation', () => {
  expect(extractMessage({ message: { conversation: 'oi' } })).toBe('oi');
});

test('extractMessage lê de extendedTextMessage', () => {
  expect(
    extractMessage({ message: { extendedTextMessage: { text: 'oi extended' } } })
  ).toBe('oi extended');
});

test('extractMessage retorna null para tipos não suportados', () => {
  expect(extractMessage({ message: { imageMessage: {} } })).toBeNull();
});
