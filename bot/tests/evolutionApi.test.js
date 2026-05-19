const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('axios', () => ({ post: mockPost, put: mockPut }));

process.env.EVOLUTION_API_URL = 'http://evolution:8080';
process.env.EVOLUTION_API_KEY = 'test-api-key';
process.env.EVOLUTION_INSTANCE = 'test-instance';
process.env.WEBHOOK_TOKEN = 'test-webhook-token';

const { sendText, registerWebhook, sendList, sendImageBase64 } = require('../src/evolutionApi');

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

test('registerWebhook envia PUT com URL e token corretos', async () => {
  mockPut.mockResolvedValue({ data: {} });
  await registerWebhook('http://bot:3000');
  expect(mockPut).toHaveBeenCalledWith(
    'http://evolution:8080/webhook/set/test-instance',
    {
      enabled: true,
      url: 'http://bot:3000/webhook',
      headers: { 'x-api-key': 'test-webhook-token' },
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
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
