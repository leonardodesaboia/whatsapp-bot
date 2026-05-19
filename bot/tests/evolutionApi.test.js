const mockPost = jest.fn();

jest.mock('axios', () => ({ post: mockPost }));

process.env.EVOLUTION_API_URL = 'http://evolution:8080';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'test-instance';
process.env.WEBHOOK_TOKEN = 'test-webhook-token';

const { sendText, registerWebhook, sendList, sendImageBase64, getMediaBase64 } = require('../src/evolutionApi');

beforeEach(() => jest.clearAllMocks());

test('sendText envia POST para o endpoint correto com número e texto', async () => {
  mockPost.mockResolvedValue({ data: {} });
  await sendText('5511999999999', 'Olá! Como posso ajudar?');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendText/test-instance',
    { number: '5511999999999', text: 'Olá! Como posso ajudar?' },
    { headers: { apikey: 'test-api-key' } }
  );
});

test('registerWebhook envia POST com payload de webhook e token corretos', async () => {
  mockPost.mockResolvedValue({ data: {} });
  await registerWebhook('http://bot:3000');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/webhook/set/test-instance',
    {
      webhook: {
        enabled: true,
        url: 'http://bot:3000/webhook',
        headers: { 'x-api-key': 'test-webhook-token' },
        webhookByEvents: true,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT'],
      },
    },
    { headers: { apikey: 'test-api-key' } }
  );
});

test('sendList envia POST para o endpoint correto', async () => {
  mockPost.mockResolvedValue({ data: {} });
  const listMessage = { title: 'Categorias', buttonText: 'Ver', sections: [] };
  await sendList('5511999999999', listMessage);
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendList/test-instance',
    { number: '5511999999999', ...listMessage },
    { headers: { apikey: 'test-api-key' } }
  );
});

test('sendImageBase64 envia POST com base64 e caption', async () => {
  mockPost.mockResolvedValue({ data: {} });
  await sendImageBase64('5511999999999', 'abc123', 'QR Code');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/message/sendMedia/test-instance',
    {
      number: '5511999999999',
      mediatype: 'image',
      mimetype: 'image/png',
      media: 'abc123',
      caption: 'QR Code',
    },
    { headers: { apikey: 'test-api-key' } }
  );
});

test('getMediaBase64 envia POST e retorna base64', async () => {
  mockPost.mockResolvedValue({ data: { base64: 'abc123base64' } });
  const messageData = { key: { id: 'msg-1' }, message: { audioMessage: {} } };
  const result = await getMediaBase64(messageData);
  expect(result).toBe('abc123base64');
  expect(mockPost).toHaveBeenCalledWith(
    'http://evolution:8080/chat/getBase64FromMediaMessage/test-instance',
    { message: messageData },
    { headers: { apikey: 'test-api-key' } }
  );
});
